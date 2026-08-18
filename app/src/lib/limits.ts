import { requireSql } from "@/lib/db";
import { getPlan, PLAN_CATALOG } from "@/lib/plans";

export class UsageLimitError extends Error { readonly status = 429; }

export const PLAN_LIMITS = PLAN_CATALOG.free.limits;

export function planLimits(plan: string | null | undefined) {
  return getPlan(plan).limits;
}

export async function enforceApiRateLimit(apiKeyId: string) {
  const sql = requireSql();
  const [account] = await sql`select o.plan from api_keys k join projects p on p.id = k.project_id join organizations o on o.id = p.organization_id where k.id = ${apiKeyId}`;
  const limit = planLimits(String(account?.plan || "free")).apiRequestsPerMinute;
  const [usage] = await sql`
    insert into api_usage_windows (api_key_id, window_start, request_count)
    values (${apiKeyId}, date_trunc('minute', now()), 1)
    on conflict (api_key_id, window_start) do update set request_count = api_usage_windows.request_count + 1
    returning request_count
  `;
  if (Number(usage.request_count) > limit) throw new UsageLimitError("API rate limit exceeded. Retry after the current minute.");
}

export async function enforceInboundRateLimit(endpointId: string) {
  const sql = requireSql();
  const [account] = await sql`select o.plan from endpoints ep join projects p on p.id = ep.project_id join organizations o on o.id = p.organization_id where ep.id = ${endpointId}`;
  const limit = planLimits(String(account?.plan || "free")).inboundRequestsPerMinute;
  const [usage] = await sql`
    insert into endpoint_usage_windows (endpoint_id, window_start, request_count)
    values (${endpointId}, date_trunc('minute', now()), 1)
    on conflict (endpoint_id, window_start) do update set request_count = endpoint_usage_windows.request_count + 1
    returning request_count
  `;
  if (Number(usage.request_count) > limit) throw new UsageLimitError("Inbound endpoint rate limit exceeded. Retry after the current minute.");
}

export async function enforceMonthlyMessageLimit(projectId: string, incomingCount = 1) {
  const sql = requireSql();
  const [account] = await sql`
    select o.id as organization_id, o.plan,
      case when o.temporary_limit_expires_at > now() then o.temporary_message_limit else null end as temporary_message_limit
    from projects p join organizations o on o.id = p.organization_id where p.id = ${projectId}
  `;
  const planLimit = planLimits(String(account?.plan || "free")).messagesPerMonth;
  const limit = account?.temporary_message_limit ? Number(account.temporary_message_limit) : planLimit;
  const [usage] = await sql`
    select (
      (select count(*) from messages m join projects p on p.id=m.project_id where p.organization_id=${account?.organization_id} and m.created_at >= date_trunc('month', now())) +
      (select count(*) from webhook_events e join endpoints ep on ep.id=e.endpoint_id join projects p on p.id=ep.project_id where p.organization_id=${account?.organization_id} and e.direction='inbound' and e.is_simulation=false and e.received_at >= date_trunc('month', now()))
    )::int as count
  `;
  if (Number(usage.count) + Math.max(1, incomingCount) > limit) throw new UsageLimitError("Monthly event limit reached for the current plan");
}
