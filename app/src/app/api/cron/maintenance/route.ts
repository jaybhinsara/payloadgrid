import { NextResponse } from "next/server";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function isAuthorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; }

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const sql = requireSql();
    const expired = await sql`select id from webhook_events where payload_redacted_at is null and payload_expires_at <= now() order by payload_expires_at asc limit 500`;
    for (const event of expired) {
      await sql`update delivery_attempts set request_headers = '{}'::jsonb, response_headers = '{}'::jsonb, response_body = null where event_id = ${event.id}`;
      await sql`update webhook_events set request_headers = '{}'::jsonb, request_body = '{"redacted":true}'::jsonb, payload_redacted_at = now() where id = ${event.id}`;
    }
    await sql`update messages set payload = '{"redacted":true}'::jsonb where created_at <= now() - interval '3 days' and payload <> '{"redacted":true}'::jsonb`;
    await sql`delete from api_usage_windows where window_start < now() - interval '2 days'`;
    await sql`delete from endpoint_usage_windows where window_start < now() - interval '2 days'`;
    await sql`delete from api_usage_window_buckets where window_start < now() - interval '2 days'`;
    await sql`delete from endpoint_usage_window_buckets where window_start < now() - interval '2 days'`;
    await sql`delete from dispatch_jobs where status = 'published' and published_at < now() - interval '7 days'`;
    const [serviceCheckPruning] = await sql`
      with total as (
        select count(*)::int as row_count from service_checks
      ), stale as (
        select id from service_checks order by checked_at desc, id desc offset 100
      ), deleted as (
        delete from service_checks
        using stale, total
        where service_checks.id = stale.id and total.row_count >= 1000
        returning service_checks.id
      )
      select count(*)::int as deleted_count from deleted
    `;
    await sql`update endpoints set previous_signing_secret = null, previous_signing_secret_expires_at = null where previous_signing_secret_expires_at <= now()`;
    const expiredSessions = await sql`delete from sessions where expires_at <= now() or last_seen_at <= now() - interval '7 days' returning id`;
    const expiredOAuthStates = await sql`delete from oauth_states where expires_at <= now() returning state_hash`;
    const expiredAuthTokens = await sql`delete from auth_tokens where expires_at <= now() or (used_at is not null and used_at <= now() - interval '1 day') returning id`;
    const expiredPlaygroundInboxes = await sql`delete from playground_inboxes where expires_at <= now() returning id`;
    const expiredPlans = await sql`
      with expired_subscriptions as (
        update billing_subscriptions set status = 'expired', updated_at = now()
        where provider = 'razorpay' and status = 'active' and current_period_end <= now()
        returning organization_id, plan
      )
      update organizations o set plan = 'free', updated_at = now()
      from expired_subscriptions s
      where o.id = s.organization_id and o.plan = s.plan
      returning o.id
    `;
    return NextResponse.json({ ok: true, redactedEvents: expired.length, prunedServiceChecks: Number(serviceCheckPruning?.deleted_count || 0), expiredSessions: expiredSessions.length, expiredOAuthStates: expiredOAuthStates.length, expiredAuthTokens: expiredAuthTokens.length, expiredPlaygroundInboxes: expiredPlaygroundInboxes.length, expiredPlans: expiredPlans.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Maintenance failed" }, { status: 500 });
  }
}
