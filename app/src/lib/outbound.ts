import { requireSql } from "@/lib/db";
import { notifyFailure } from "@/lib/alerts";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";

type DispatchInput = {
  projectId: string;
  applicationId: string;
  eventType: string;
  payload: unknown;
  idempotencyKey?: string | null;
};

function transformPayload(payload: unknown, configs: unknown[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const result: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const raw of configs) {
    if (!raw || typeof raw !== "object") continue;
    const config = raw as { addFields?: Record<string, unknown>; removeFields?: string[]; renameFields?: Record<string, string> };
    for (const [key, value] of Object.entries(config.addFields || {})) result[key] = value;
    for (const key of config.removeFields || []) delete result[key];
    for (const [from, to] of Object.entries(config.renameFields || {})) {
      if (from in result) {
        result[to] = result[from];
        delete result[from];
      }
    }
  }
  return result;
}

export async function dispatchMessage(input: DispatchInput) {
  const sql = requireSql();
  const [application] = await sql`
    select id from applications where id = ${input.applicationId} and project_id = ${input.projectId} limit 1
  `;
  if (!application) throw new Error("Application not found in this project");

  if (input.idempotencyKey) {
    const [existing] = await sql`
      select id, status from messages where project_id = ${input.projectId} and idempotency_key = ${input.idempotencyKey} limit 1
    `;
    if (existing) return { messageId: String(existing.id), status: String(existing.status), duplicate: true, deliveries: [] };
  }

  const transformations = await sql`
    select config from transformations
    where project_id = ${input.projectId} and is_active = true and (event_type is null or event_type = ${input.eventType})
    order by created_at asc
  `;
  const payload = transformPayload(input.payload, transformations.map((row) => row.config));

  const [message] = await sql`
    insert into messages (project_id, application_id, event_type, idempotency_key, payload, status)
    values (${input.projectId}, ${input.applicationId}, ${input.eventType}, ${input.idempotencyKey || null}, ${JSON.stringify(payload)}::jsonb, 'processing')
    returning id
  `;

  const endpoints = await sql`
    select ep.id, ep.destination_url, ep.signing_secret
    from endpoints ep
    where ep.project_id = ${input.projectId}
      and ep.application_id = ${input.applicationId}
      and ep.is_active = true
      and (
        not exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id)
        or exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id and s.event_type = ${input.eventType})
      )
    order by ep.created_at asc
  `;

  const results: Array<{ eventId: string; endpointId: string; status: string; responseStatus: number | null }> = [];
  for (const endpoint of endpoints) {
    const [event] = await sql`
      insert into webhook_events (endpoint_id, application_id, message_id, direction, provider, provider_event_id, event_type, request_body, status, max_retries)
      values (${endpoint.id}, ${input.applicationId}, ${message.id}, 'outbound', 'hookin', ${message.id}, ${input.eventType}, ${JSON.stringify(payload)}::jsonb, 'received', 6)
      returning id
    `;
    const headers = { "hookin-event-type": input.eventType };
    const delivery = await deliverWebhook(
      String(endpoint.destination_url), payload, "outbound", headers,
      endpoint.signing_secret ? { secret: String(endpoint.signing_secret), deliveryId: String(event.id) } : undefined
    );
    const willRetry = !delivery.ok && shouldRetry(1, 6);
    const status = delivery.ok ? "delivered" : willRetry ? "retrying" : "failed";
    await sql`
      insert into delivery_attempts (event_id, attempt_number, destination_url, request_headers, response_status, response_headers, response_body, error, latency_ms)
      values (${event.id}, 1, ${endpoint.destination_url}, ${JSON.stringify(headers)}::jsonb, ${delivery.status}, ${JSON.stringify(delivery.responseHeaders)}::jsonb, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})
    `;
    await sql`
      update webhook_events set status = ${status}, retry_count = ${delivery.ok ? 0 : 1},
        next_retry_at = case when ${willRetry} then now() + (${nextRetryDelayMinutes(1)} * interval '1 minute') else null end,
        last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)}, updated_at = now()
      where id = ${event.id}
    `;
    if (!delivery.ok) await notifyFailure({ projectId: input.projectId, eventId: String(event.id), eventType: input.eventType, error: delivery.error || `Destination HTTP ${delivery.status}` });
    results.push({ eventId: String(event.id), endpointId: String(endpoint.id), status, responseStatus: delivery.status });
  }

  const delivered = results.filter((item) => item.status === "delivered").length;
  const finalStatus = results.length === 0 ? "failed" : delivered === results.length ? "delivered" : delivered > 0 ? "partial" : "failed";
  await sql`update messages set status = ${finalStatus}, updated_at = now() where id = ${message.id}`;
  return { messageId: String(message.id), status: finalStatus, duplicate: false, deliveries: results };
}