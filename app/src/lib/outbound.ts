import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { requireSql } from "@/lib/db";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { queueConfigured } from "@/lib/queue";

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
  const transformations = await sql`
    select config from transformations where project_id = ${input.projectId} and is_active = true
      and (event_type is null or event_type = ${input.eventType}) order by created_at asc
  `;
  const payload = transformPayload(input.payload, transformations.map((row) => row.config));
  const messageId = randomUUID();
  const [accepted] = await sql`
    with accepted_message as (
      insert into messages (id, project_id, application_id, event_type, idempotency_key, payload, status)
      values (${messageId}, ${input.projectId}, ${input.applicationId}, ${input.eventType}, ${input.idempotencyKey || null}, ${JSON.stringify(payload)}::jsonb, 'queued')
      on conflict (project_id, idempotency_key) do update set idempotency_key = excluded.idempotency_key
      returning id, id = ${messageId}::uuid as inserted
    ), inserted_events as (
      insert into webhook_events (
        endpoint_id, application_id, message_id, direction, provider, provider_event_id,
        event_type, request_body, status, max_retries
      )
      select ep.id, ${input.applicationId}, am.id, 'outbound', 'payloadgrid', am.id::text,
        ${input.eventType}, ${JSON.stringify(payload)}::jsonb,
        case when ep.circuit_state = 'open' then 'buffered' else 'queued' end, 6
      from accepted_message am
      join endpoints ep on ep.project_id = ${input.projectId} and ep.application_id = ${input.applicationId}
        and ep.is_active = true and ep.deleted_at is null
      where am.inserted and (
        not exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id)
        or exists (select 1 from endpoint_subscriptions s where s.endpoint_id = ep.id and s.event_type = ${input.eventType})
      )
      returning id, status
    ), inserted_jobs as (
      insert into dispatch_jobs (event_id, status, available_at)
      select id, 'pending', now() from inserted_events where status = 'queued'
      returning event_id
    ), finalize_empty as (
      update messages m set status = 'delivered', updated_at = now()
      from accepted_message am
      where m.id = am.id and am.inserted and not exists (select 1 from inserted_events)
      returning m.id
    )
    select am.id, am.inserted,
      (select status from messages where id = am.id) as status,
      (select count(*)::int from inserted_events) as delivery_count,
      (select count(*)::int from inserted_jobs) as dispatch_count
    from accepted_message am
  `;
  const duplicate = !Boolean(accepted.inserted);
  const dispatchCount = Number(accepted.dispatch_count || 0);
  if (dispatchCount) after(() => dispatchOutboxBatch(Math.min(dispatchCount, 100)));
  return {
    messageId: String(accepted.id), status: duplicate ? String(accepted.status) : Number(accepted.delivery_count) ? "accepted" : "delivered",
    duplicate, queuedDeliveries: duplicate ? 0 : Number(accepted.delivery_count || 0),
    scheduledDeliveries: duplicate ? 0 : dispatchCount, queueConfigured: queueConfigured()
  };
}
