import { NextResponse } from "next/server";
import { dispatchOutboxBatch, recoverMissingDispatchJobs } from "@/lib/dispatch-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

async function run(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const recovered = await recoverMissingDispatchJobs(250);
    const dispatch = await dispatchOutboxBatch(100);
    return NextResponse.json({ ok: true, recovered, dispatch });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Outbox dispatch failed" }, { status: 500 });
  }
}

export const GET = run;
export const POST = run;
