import { randomInt } from "node:crypto";
import { requireSql } from "@/lib/db";
import { getPlan, PLAN_CATALOG } from "@/lib/plans";

const RATE_COUNTER_BUCKETS = 16;

export class UsageLimitError extends Error {
  readonly status = 429;
  constructor(message: string, readonly retryAfterSeconds?: number) { super(message); }
}

export function usageLimitHeaders(error: UsageLimitError): Record<string, string> {
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (error.retryAfterSeconds) headers["retry-after"] = String(error.retryAfterSeconds);
  return headers;
}

export const PLAN_LIMITS = PLAN_CATALOG.free.limits;

export function planLimits(plan: string | null | undefined) {
  return getPlan(plan).limits;
}

export type MonthlyLimitContext = { organizationId: string; messagesPerMonth: number };

function secondsUntilNextMinute() {
  return Math.max(1, 60 - new Date().getUTCSeconds());
}

export async function enforceApiRateLimit(apiKeyId: string, configuredLimit?: number) {
  const sql = requireSql();
  let limit = configuredLimit;
  if (!limit) {
    const [account] = await sql`select o.plan from api_keys k join projects p on p.id = k.project_id join organizations o on o.id = p.organization_id where k.id = ${apiKeyId}`;
    limit = planLimits(String(account?.plan || "free")).apiRequestsPerMinute;
  }
  const bucket = randomInt(RATE_COUNTER_BUCKETS);
  const [usage] = await sql`
    with incremented as (
      insert into api_usage_window_buckets (api_key_id, window_start, bucket, request_count)
      values (${apiKeyId}, date_trunc('minute', now()), ${bucket}, 1)
      on conflict (api_key_id, window_start, bucket)
      do update set request_count = api_usage_window_buckets.request_count + 1
      returning bucket, request_count
    )
    select (incremented.request_count + coalesce((
      select sum(other.request_count) from api_usage_window_buckets other
      where other.api_key_id = ${apiKeyId}
        and other.window_start = date_trunc('minute', now())
        and other.bucket <> incremented.bucket
    ), 0))::bigint as request_count
    from incremented
  `;
  if (Number(usage.request_count) > limit) throw new UsageLimitError("API rate limit exceeded. Retry after the current minute.", secondsUntilNextMinute());
}

export async function enforceInboundRateLimit(endpointId: string, configuredLimit?: number) {
  const sql = requireSql();
  let limit = configuredLimit;
  if (!limit) {
    const [account] = await sql`select o.plan from endpoints ep join projects p on p.id = ep.project_id join organizations o on o.id = p.organization_id where ep.id = ${endpointId}`;
    limit = planLimits(String(account?.plan || "free")).inboundRequestsPerMinute;
  }
  const bucket = randomInt(RATE_COUNTER_BUCKETS);
  const [usage] = await sql`
    with incremented as (
      insert into endpoint_usage_window_buckets (endpoint_id, window_start, bucket, request_count)
      values (${endpointId}, date_trunc('minute', now()), ${bucket}, 1)
      on conflict (endpoint_id, window_start, bucket)
      do update set request_count = endpoint_usage_window_buckets.request_count + 1
      returning bucket, request_count
    )
    select (incremented.request_count + coalesce((
      select sum(other.request_count) from endpoint_usage_window_buckets other
      where other.endpoint_id = ${endpointId}
        and other.window_start = date_trunc('minute', now())
        and other.bucket <> incremented.bucket
    ), 0))::bigint as request_count
    from incremented
  `;
  if (Number(usage.request_count) > limit) throw new UsageLimitError("Inbound endpoint rate limit exceeded. Retry after the current minute.", secondsUntilNextMinute());
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
