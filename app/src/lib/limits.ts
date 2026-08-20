import { requireSql } from "@/lib/db";
import { getPlan, PLAN_CATALOG } from "@/lib/plans";

export class UsageLimitError extends Error { readonly status = 429; }

export const PLAN_LIMITS = PLAN_CATALOG.free.limits;

export function planLimits(plan: string | null | undefined) {
  return getPlan(plan).limits;
}

export type MonthlyLimitContext = { organizationId: string; messagesPerMonth: number };

export async function enforceApiRateLimit(apiKeyId: string, configuredLimit?: number) {
  const sql = requireSql();
  let limit = configuredLimit;
  if (!limit) {
    const [account] = await sql`select o.plan from api_keys k join projects p on p.id = k.project_id join organizations o on o.id = p.organization_id where k.id = ${apiKeyId}`;
    limit = planLimits(String(account?.plan || "free")).apiRequestsPerMinute;
  }
  const [usage] = await sql`
    insert into api_usage_windows (api_key_id, window_start, request_count)
    values (${apiKeyId}, date_trunc('minute', now()), 1)
    on conflict (api_key_id, window_start) do update set request_count = api_usage_windows.request_count + 1
    returning request_count
  `;
  if (Number(usage.request_count) > limit) throw new UsageLimitError("API rate limit exceeded. Retry after the current minute.");
}

export async function enforceInboundRateLimit(endpointId: string, configuredLimit?: number) {
  const sql = requireSql();
  let limit = configuredLimit;
  if (!limit) {
    const [account] = await sql`select o.plan from endpoints ep join projects p on p.id = ep.project_id join organizations o on o.id = p.organization_id where ep.id = ${endpointId}`;
    limit = planLimits(String(account?.plan || "free")).inboundRequestsPerMinute;
  }
  const [usage] = await sql`
    insert into endpoint_usage_windows (endpoint_id, window_start, request_count)
    values (${endpointId}, date_trunc('minute', now()), 1)
    on conflict (endpoint_id, window_start) do update set request_count = endpoint_usage_windows.request_count + 1
    returning request_count
  `;
  if (Number(usage.request_count) > limit) throw new UsageLimitError("Inbound endpoint rate limit exceeded. Retry after the current minute.");
}

export async function enforceMonthlyMessageLimit(projectId: string, incomingCount = 1, context?: MonthlyLimitContext) {
  const sql = requireSql();
  let organizationId = context?.organizationId;
  let limit = context?.messagesPerMonth;
  if (!organizationId || !limit) {
    const [account] = await sql`
      select o.id as organization_id, o.plan,
        case when o.temporary_limit_expires_at > now() then o.temporary_message_limit else null end as temporary_message_limit
      from projects p join organizations o on o.id = p.organization_id where p.id = ${projectId}
    `;
    organizationId = account?.organization_id ? String(account.organization_id) : undefined;
    const planLimit = planLimits(String(account?.plan || "free")).messagesPerMonth;
    limit = account?.temporary_message_limit ? Number(account.temporary_message_limit) : planLimit;
  }
  if (!organizationId) throw new UsageLimitError("Project does not belong to an active organization");
  const [usage] = await sql`
    select coalesce(sum(outbound_events + inbound_events), 0)::bigint as count
    from organization_usage_month_buckets
    where organization_id = ${organizationId} and month_start = date_trunc('month', now())::date
  `;
  if (Number(usage.count) + Math.max(1, incomingCount) > Number(limit)) throw new UsageLimitError("Monthly event limit reached for the current plan");
}
