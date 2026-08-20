import { notifyFailure } from "@/lib/alerts";
import { requireSql } from "@/lib/db";
import { nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { deliverToDestination, type DestinationType } from "@/lib/destination-adapters";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { decryptSecret } from "@/lib/security";

export type DeliveryProcessResult = {
  processed: boolean;
  reason?: string;
  status?: string;
  attempt?: number;
  responseStatus?: number | null;
  retryScheduled?: boolean;
};

async function reserveEndpointDeliverySlot(endpointId: string, rateLimitPerMinute: number) {
  const sql = requireSql();
  const [slot] = await sql`
    insert into endpoint_delivery_windows (endpoint_id, window_started_at, delivery_count, updated_at)
    values (${endpointId}, date_trunc('minute', now()), 1, now())
    on conflict (endpoint_id) do update set
      window_started_at=case when endpoint_delivery_windows.window_started_at < date_trunc('minute', now()) then date_trunc('minute', now()) else endpoint_delivery_windows.window_started_at end,
      delivery_count=case when endpoint_delivery_windows.window_started_at < date_trunc('minute', now()) then 1 else endpoint_delivery_windows.delivery_count + 1 end,
      updated_at=now()
    where endpoint_delivery_windows.window_started_at < date_trunc('minute', now())
      or endpoint_delivery_windows.delivery_count < ${Math.max(1, rateLimitPerMinute)}
    returning endpoint_id
  `;
  return Boolean(slot);
}

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

export async function processDelivery(eventId: string): Promise<DeliveryProcessResult> {
  const sql = requireSql();
  const [claimed] = await sql`
    with target as (select id, status as previous_status from webhook_events where id=${eventId})
    update webhook_events e set status = 'processing', locked_at = now(), updated_at = now()
    from target
    where e.id = target.id
      and e.status in ('queued','received','retrying')
      and (next_retry_at is null or next_retry_at <= now())
      and (locked_at is null or locked_at < now() - interval '5 minutes')
      and exists (
        select 1 from endpoints ep join projects p on p.id=ep.project_id
        join organizations o on o.id=p.organization_id
        where ep.id=e.endpoint_id and o.suspended_at is null and o.delivery_paused_at is null
      )
    returning e.id, e.endpoint_id, e.message_id, e.direction, e.event_type, e.request_body, e.request_raw_body, e.request_content_type,
      e.max_retries, e.revenue_amount, e.revenue_at_risk, e.is_simulation, target.previous_status
  `;
  if (!claimed) return { processed: false, reason: "Event is already processing, completed, or not due" };
  const [endpoint] = await sql`
    select ep.project_id, ep.destination_type, ep.destination_url, ep.signing_secret, ep.delivery_headers_encrypted,
      case when ep.previous_signing_secret_expires_at > now() then ep.previous_signing_secret else null end as previous_signing_secret,
      ep.is_active, ep.rate_limit_per_minute,
      p.payload_retention_mode
    from endpoints ep join projects p on p.id = ep.project_id where ep.id = ${claimed.endpoint_id} limit 1
  `;
  if (!endpoint?.is_active) {
    await sql`update webhook_events set status = 'dead_letter', locked_at = null, next_retry_at = null, dead_lettered_at = now(), last_error = 'Endpoint is inactive', updated_at = now() where id = ${claimed.id}`;
    if (claimed.message_id) await updateMessageStatus(String(claimed.message_id));
    return { processed: true, status: "dead_letter" };
  }
  if (!(await reserveEndpointDeliverySlot(String(claimed.endpoint_id), Number(endpoint.rate_limit_per_minute || 120)))) {
    const nextWindow = new Date(Math.ceil(Date.now() / 60_000) * 60_000 + 1000);
    await sql`update webhook_events set status=${claimed.previous_status}, locked_at=null, next_retry_at=${nextWindow.toISOString()}, updated_at=now() where id=${claimed.id} and status='processing'`;
    await sql`
      insert into dispatch_jobs (event_id, status, available_at, last_error, locked_at, qstash_message_id, published_at, updated_at)
      values (${claimed.id}, 'pending', ${nextWindow.toISOString()}, 'Endpoint delivery rate limit deferred this event', null, null, null, now())
      on conflict (event_id) do update set status='pending', available_at=excluded.available_at,
        last_error=excluded.last_error, locked_at=null, qstash_message_id=null, published_at=null, updated_at=now()
    `;
    return { processed: false, reason: "Endpoint delivery rate limit reached", status: String(claimed.previous_status) };
  }
  const [attemptRow] = await sql`select count(*)::int as count from delivery_attempts where event_id = ${claimed.id}`;
  const attempt = Number(attemptRow.count || 0) + 1;
  const maxRetries = Number(claimed.max_retries || 6);
  const mode = claimed.direction === "inbound" ? (attempt === 1 ? "forward" : "retry") : (attempt === 1 ? "outbound" : "retry");
  let customHeaders: Record<string, string> = {};
  if (endpoint.delivery_headers_encrypted) {
    try { customHeaders = JSON.parse(decryptSecret(String(endpoint.delivery_headers_encrypted))) as Record<string, string>; }
    catch { customHeaders = {}; }
  }
  const headers = { ...customHeaders, "payloadgrid-event-type": String(claimed.event_type) };
  const delivery = await deliverToDestination({
    type: String(endpoint.destination_type || "webhook") as DestinationType,
    url: String(endpoint.destination_url), payload: claimed.request_body, mode, headers,
    signing: endpoint.signing_secret ? { secret: String(endpoint.signing_secret), previousSecret: endpoint.previous_signing_secret ? String(endpoint.previous_signing_secret) : null, deliveryId: String(claimed.id) } : undefined,
    content: { rawBody: claimed.request_raw_body ? String(claimed.request_raw_body) : null, contentType: String(claimed.request_content_type || "application/json") }
  });
  const willRetry = !delivery.ok && shouldRetry(attempt, maxRetries);
  const status = delivery.ok ? "delivered" : willRetry ? "retrying" : "dead_letter";
  const retryDelayMinutes = willRetry ? nextRetryDelayMinutes(attempt) : 0;
  await sql`
    insert into delivery_attempts (event_id, attempt_number, destination_url, request_headers, response_status, response_headers, response_body, error, latency_ms)
    values (${claimed.id}, ${attempt}, ${endpoint.destination_url}, ${JSON.stringify(headers)}::jsonb, ${delivery.status}, ${JSON.stringify(delivery.responseHeaders)}::jsonb, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})
  `;
  await sql`
    with updated_event as (
      update webhook_events set status = ${status}, locked_at = null, retry_count = ${delivery.ok ? Math.max(0, attempt - 1) : attempt},
        revenue_at_risk = case when ${delivery.ok} then 0 else revenue_amount end,
        next_retry_at = case when ${willRetry} then now() + (${retryDelayMinutes} * interval '1 minute') else null end,
        dead_lettered_at = case when ${status === "dead_letter"} then now() else null end, cancelled_at = null,
        last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)}, updated_at = now()
      where id = ${claimed.id}
      returning id
    ), retry_job as (
      insert into dispatch_jobs (event_id, status, available_at, last_error, locked_at, qstash_message_id, published_at, updated_at)
      select id, 'pending', now(), null, null, null, null, now() from updated_event where ${willRetry}
      on conflict (event_id) do update set status = 'pending', available_at = now(), last_error = null,
        locked_at = null, qstash_message_id = null, published_at = null, updated_at = now()
      returning event_id
    )
    select id from updated_event
  `;
  if (String(endpoint.payload_retention_mode) === "transient" && !willRetry) {
    await sql`
      update webhook_events set request_body = '{"redacted":true}'::jsonb, request_raw_body = null,
        payload_redacted_at = now(), updated_at = now()
      where id = ${claimed.id}
    `;
  }
  if (claimed.message_id) await updateMessageStatus(String(claimed.message_id));
  if (!delivery.ok && !claimed.is_simulation) await notifyFailure({ projectId: String(endpoint.project_id), eventId: String(claimed.id), eventType: String(claimed.event_type), error: delivery.error || `Destination HTTP ${delivery.status}` });
  let retryScheduled = false;
  if (willRetry) {
    try {
      const dispatched: { published: number; deferred: number } = await dispatchOutboxBatch(1, String(claimed.id));
      retryScheduled = dispatched.published > 0 || dispatched.deferred > 0;
    } catch { retryScheduled = false; }
  }
  return { processed: true, status, attempt, responseStatus: delivery.status, retryScheduled };
}
