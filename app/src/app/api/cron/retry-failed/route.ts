import { NextResponse } from "next/server";
import { requireSql } from "@/lib/db";
import { dispatchOutboxBatch, recoverMissingDispatchJobs } from "@/lib/dispatch-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function isAuthorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; }

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const sql = requireSql();
    await sql`update webhook_events set status = 'queued', locked_at = null where status = 'processing' and locked_at < now() - interval '5 minutes'`;
    const recovered = await recoverMissingDispatchJobs(250);
    const dispatch = await dispatchOutboxBatch(100);
    return NextResponse.json({ ok: true, recovered, dispatch });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Queue drain failed" }, { status: 500 });
  }
}
