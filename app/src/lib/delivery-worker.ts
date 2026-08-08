import { notifyFailure } from "@/lib/alerts";
import { requireSql } from "@/lib/db";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { enqueueDelivery } from "@/lib/queue";

export async function updateMessageStatus(messageId: string) {
  const sql = requireSql();
  const [summary] = await sql`
    select count(*)::int as total,
      count(*) filter (where status = 'delivered')::int as delivered,
      count(*) filter (where status in ('failed','dead_letter','cancelled'))::int as failed,
      count(*) filter (where status in ('queued','processing','received','retrying'))::int as active
    from webhook_events where message_id = ${messageId}
  `;
  const total = Number(summary.total); const delivered = Number(summary.delivered); const active = Number(summary.active);
  const status = active > 0 ? "processing" : delivered === total ? "delivered" : delivered > 0 ? "partial" : "failed";
  await sql`
    update messages m set
      status = ${status},
      payload = case
        when ${active === 0} and p.payload_retention_mode = 'transient' then '{"redacted":true}'::jsonb
        else m.payload
      end,
      updated_at = now()
    from projects p
    where m.id = ${messageId} and p.id = m.project_id
  `;
}

export async function processDelivery(eventId: string) {
  const sql = requireSql();
  const [claimed] = await sql`
    update webhook_events set status = 'processing', locked_at = now(), updated_at = now()
    where id = ${eventId}
      and status in ('queued','received','retrying')
      and (next_retry_at is null or next_retry_at <= now())
      and (locked_at is null or locked_at < now() - interval '5 minutes')
    returning id, endpoint_id, message_id, direction, event_type, request_body, request_raw_body, request_content_type,
      max_retries, revenue_amount, revenue_at_risk
  `;
  if (!claimed) return { processed: false, reason: "Event is already processing, completed, or not due" };
  const [endpoint] = await sql`
    select ep.project_id, ep.destination_url, ep.signing_secret, ep.is_active, ep.rate_limit_per_minute,
      p.payload_retention_mode
    from endpoints ep join projects p on p.id = ep.project_id where ep.id = ${claimed.endpoint_id} limit 1
  `;
  if (!endpoint?.is_active) {
    await sql`update webhook_events set status = 'dead_letter', locked_at = null, next_retry_at = null, dead_lettered_at = now(), last_error = 'Endpoint is inactive', updated_at = now() where id = ${claimed.id}`;
    if (claimed.message_id) await updateMessageStatus(String(claimed.message_id));
    return { processed: true, status: "dead_letter" };
  }
  const [attemptRow] = await sql`select count(*)::int as count from delivery_attempts where event_id = ${claimed.id}`;
  const attempt = Number(attemptRow.count || 0) + 1;
  const maxRetries = Number(claimed.max_retries || 6);
  const mode = claimed.direction === "inbound" ? (attempt === 1 ? "forward" : "retry") : (attempt === 1 ? "outbound" : "retry");
  const headers = { "payloadgrid-event-type": String(claimed.event_type) };
  const delivery = await deliverWebhook(
    String(endpoint.destination_url), claimed.request_body, mode, headers,
    endpoint.signing_secret ? { secret: String(endpoint.signing_secret), deliveryId: String(claimed.id) } : undefined,
    { rawBody: claimed.request_raw_body ? String(claimed.request_raw_body) : null, contentType: String(claimed.request_content_type || "application/json") }
  );
  const willRetry = !delivery.ok && shouldRetry(attempt, maxRetries);
  const status = delivery.ok ? "delivered" : willRetry ? "retrying" : "dead_letter";
  const retryDelayMinutes = willRetry ? nextRetryDelayMinutes(attempt) : 0;
  await sql`
    insert into delivery_attempts (event_id, attempt_number, destination_url, request_headers, response_status, response_headers, response_body, error, latency_ms)
    values (${claimed.id}, ${attempt}, ${endpoint.destination_url}, ${JSON.stringify(headers)}::jsonb, ${delivery.status}, ${JSON.stringify(delivery.responseHeaders)}::jsonb, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})
  `;
  await sql`
    update webhook_events set status = ${status}, locked_at = null, retry_count = ${delivery.ok ? Math.max(0, attempt - 1) : attempt},
      revenue_at_risk = case when ${delivery.ok} then 0 else revenue_amount end,
      next_retry_at = case when ${willRetry} then now() + (${retryDelayMinutes} * interval '1 minute') else null end,
      dead_lettered_at = case when ${status === "dead_letter"} then now() else null end, cancelled_at = null,
      last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)}, updated_at = now()
    where id = ${claimed.id}
  `;
  if (String(endpoint.payload_retention_mode) === "transient" && !willRetry) {
    await sql`
      update webhook_events set request_body = '{"redacted":true}'::jsonb, request_raw_body = null,
        payload_redacted_at = now(), updated_at = now()
      where id = ${claimed.id}
    `;
  }
  if (claimed.message_id) await updateMessageStatus(String(claimed.message_id));
  if (!delivery.ok) await notifyFailure({ projectId: String(endpoint.project_id), eventId: String(claimed.id), eventType: String(claimed.event_type), error: delivery.error || `Destination HTTP ${delivery.status}` });
  let retryScheduled = false;
  if (willRetry) {
    try {
      const queued = await enqueueDelivery({ eventId: String(claimed.id), endpointId: String(claimed.endpoint_id), attempt: attempt + 1, delaySeconds: retryDelayMinutes * 60, rateLimitPerMinute: Number(endpoint.rate_limit_per_minute) });
      retryScheduled = queued.queued;
    } catch { retryScheduled = false; }
  }
  return { processed: true, status, attempt, responseStatus: delivery.status, retryScheduled };
}
