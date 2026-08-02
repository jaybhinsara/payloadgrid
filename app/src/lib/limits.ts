import { requireSql } from "@/lib/db";

export class UsageLimitError extends Error { readonly status = 429; }

export const PLAN_LIMITS = {
  messagesPerMonth: 10_000,
  apiRequestsPerMinute: 300,
  inboundRequestsPerMinute: 300,
  endpoints: 10,
  teamMembers: 5,
  payloadRetentionDays: 3
} as const;

export async function enforceApiRateLimit(apiKeyId: string) {
  const sql = requireSql();
  const [usage] = await sql`
    insert into api_usage_windows (api_key_id, window_start, request_count)
    values (${apiKeyId}, date_trunc('minute', now()), 1)
    on conflict (api_key_id, window_start) do update set request_count = api_usage_windows.request_count + 1
    returning request_count
  `;
  if (Number(usage.request_count) > PLAN_LIMITS.apiRequestsPerMinute) throw new UsageLimitError("API rate limit exceeded. Retry after the current minute.");
}

export async function enforceInboundRateLimit(endpointId: string) {
  const sql = requireSql();
  const [usage] = await sql`
    insert into endpoint_usage_windows (endpoint_id, window_start, request_count)
    values (${endpointId}, date_trunc('minute', now()), 1)
    on conflict (endpoint_id, window_start) do update set request_count = endpoint_usage_windows.request_count + 1
    returning request_count
  `;
  if (Number(usage.request_count) > PLAN_LIMITS.inboundRequestsPerMinute) throw new UsageLimitError("Inbound endpoint rate limit exceeded. Retry after the current minute.");
}

export async function enforceMonthlyMessageLimit(projectId: string) {
  const sql = requireSql();
  const [usage] = await sql`
    select (
      (select count(*) from messages where project_id = ${projectId} and created_at >= date_trunc('month', now())) +
      (select count(*) from webhook_events e join endpoints ep on ep.id = e.endpoint_id where ep.project_id = ${projectId} and e.direction = 'inbound' and e.received_at >= date_trunc('month', now()))
    )::int as count
  `;
  if (Number(usage.count) >= PLAN_LIMITS.messagesPerMonth) throw new UsageLimitError("Monthly event limit reached for the current plan");
}