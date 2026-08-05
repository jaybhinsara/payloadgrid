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
    await sql`delete from sessions where expires_at <= now()`;
    await sql`delete from oauth_states where expires_at <= now()`;
    return NextResponse.json({ ok: true, redactedEvents: expired.length });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Maintenance failed" }, { status: 500 });
  }
}