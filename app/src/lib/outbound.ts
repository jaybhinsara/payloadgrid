import { after } from "next/server";
import { requireSql } from "@/lib/db";
import { processDelivery } from "@/lib/delivery-worker";
import { enqueueDelivery, queueConfigured } from "@/lib/queue";

export type AcceptMessageInput = {
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
      if (from in result) { result[to] = result[from]; delete result[from]; }
    }
  }
  return result;
}

export async function acceptMessage(input: AcceptMessageInput) {
  const sql = requireSql();
  const [application] = await sql`select id from applications where id = ${input.applicationId} and project_id = ${input.projectId} limit 1`;
  if (!application) throw new Error("Application not found in this project");
  if (input.idempotencyKey) {
    const [existing] = await sql`select id, status from messages where project_id = ${input.projectId} and idempotency_key = ${input.idempotencyKey} limit 1`;
    if (existing) return { messageId: String(existing.id), status: String(existing.status), duplicate: true, queuedDeliveries: 0, queueConfigured: queueConfigured() };
  }
  const transformations = await sql`
    select config from transformations where project_id = ${input.projectId} and is_active = true
      and (event_type is null or event_type = ${input.eventType}) order by created_at asc
  `;
  const payload = transformPayload(input.payload, transformations.map((row) => row.config));
  const [message] = await sql`
    insert into messages (project_id, application_id, event_type, idempotency_key, payload, status)
    values (${input.projectId}, ${input.applicationId}, ${input.eventType}, ${input.idempotencyKey || null}, ${JSON.stringify(payload)}::jsonb, 'queued') returning id
  `;
  const endpoints = await sql`
    select ep.id, ep.rate_limit_per_minute from endpoints ep
    where ep.project_id = ${input.projectId} and ep.application_id = ${input.applicationId} and ep.is_active = true
      and (not exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id)
        or exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id and s.event_type = ${input.eventType}))
    order by ep.created_at asc
  `;
  const jobs: Array<{ eventId: string; queued: boolean }> = [];
  for (const endpoint of endpoints) {
    const [event] = await sql`
      insert into webhook_events (endpoint_id, application_id, message_id, direction, provider, provider_event_id, event_type, request_body, status, max_retries)
      values (${endpoint.id}, ${input.applicationId}, ${message.id}, 'outbound', 'payloadgrid', ${message.id}, ${input.eventType}, ${JSON.stringify(payload)}::jsonb, 'queued', 6) returning id
    `;
    let queued = false;
    try {
      const result = await enqueueDelivery({ eventId: String(event.id), endpointId: String(endpoint.id), attempt: 1, rateLimitPerMinute: Number(endpoint.rate_limit_per_minute) });
      queued = result.queued;
    } catch { queued = false; }
    jobs.push({ eventId: String(event.id), queued });
    if (!queued) after(() => processDelivery(String(event.id)));
  }
  if (!endpoints.length) await sql`update messages set status = 'delivered', updated_at = now() where id = ${message.id}`;
  return {
    messageId: String(message.id), status: endpoints.length ? "accepted" : "delivered", duplicate: false,
    queuedDeliveries: endpoints.length, scheduledDeliveries: jobs.filter((job) => job.queued).length, queueConfigured: queueConfigured()
  };
}