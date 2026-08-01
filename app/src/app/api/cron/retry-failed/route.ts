import { NextResponse } from "next/server";
import { processDelivery } from "@/lib/delivery-worker";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function isAuthorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; }

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const sql = requireSql();
    await sql`update webhook_events set status = 'queued', locked_at = null where status = 'processing' and locked_at < now() - interval '5 minutes'`;
    const events = await sql`
      select id from webhook_events
      where status in ('queued','retrying','received') and (next_retry_at is null or next_retry_at <= now())
      order by coalesce(next_retry_at, received_at) asc limit 25
    `;
    const results = [];
    for (const event of events) results.push(await processDelivery(String(event.id)));
    return NextResponse.json({ ok: true, processed: results.filter((result) => result.processed).length, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Queue drain failed" }, { status: 500 });
  }
}