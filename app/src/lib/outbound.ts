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

function readPath(value: Record<string, unknown>, path: string) {
  return path.split(".").filter(Boolean).reduce<unknown>((current, key) => current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined, value);
}

function writePath(value: Record<string, unknown>, path: string, nextValue: unknown) {
  const parts = path.split(".").filter(Boolean);
  if (!parts.length) return;
  let cursor = value;
  for (const part of parts.slice(0, -1)) {
    const child = cursor[part];
    cursor[part] = child && typeof child === "object" && !Array.isArray(child) ? { ...(child as Record<string, unknown>) } : {};
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts.at(-1)!] = nextValue;
}

function transformPayload(payload: unknown, configs: unknown[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const result: Record<string, unknown> = { ...(payload as Record<string, unknown>) };
  for (const raw of configs) {
    if (!raw || typeof raw !== "object") continue;
    const config = raw as { addFields?: Record<string, unknown>; removeFields?: string[]; renameFields?: Record<string, string>; mappings?: Array<{ from: string; to: string }> };
    for (const mapping of config.mappings || []) {
      const mapped = readPath(result, mapping.from);
      if (mapped !== undefined) writePath(result, mapping.to, mapped);
    }
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
    select ep.id, ep.rate_limit_per_minute, ep.circuit_state from endpoints ep
    where ep.project_id = ${input.projectId} and ep.application_id = ${input.applicationId} and ep.is_active = true
      and (not exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id)
        or exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id and s.event_type = ${input.eventType}))
    order by ep.created_at asc
  `;
  const jobs: Array<{ eventId: string; queued: boolean }> = [];
  for (const endpoint of endpoints) {
    const [event] = await sql`
      insert into webhook_events (endpoint_id, application_id, message_id, direction, provider, provider_event_id, event_type, request_body, status, max_retries)
      values (${endpoint.id}, ${input.applicationId}, ${message.id}, 'outbound', 'payloadgrid', ${message.id}, ${input.eventType}, ${JSON.stringify(payload)}::jsonb, ${String(endpoint.circuit_state) === "open" ? "buffered" : "queued"}, 6) returning id
    `;
    if (String(endpoint.circuit_state) === "open") {
      jobs.push({ eventId: String(event.id), queued: false });
      continue;
    }
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
