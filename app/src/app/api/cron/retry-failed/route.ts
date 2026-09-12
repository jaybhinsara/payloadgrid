import { NextResponse } from "next/server";
import { dispatchOutboxBatch, recoverMissingDispatchJobs } from "@/lib/dispatch-outbox";
import { constantTimeEquals } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function isAuthorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && constantTimeEquals(request.headers.get("authorization") || "", `Bearer ${secret}`); }

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const recovered = await recoverMissingDispatchJobs(250);
    const dispatch = await dispatchOutboxBatch(100);
    return NextResponse.json({ ok: true, recovered, dispatch });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Queue drain failed" }, { status: 500 });
  }
}
