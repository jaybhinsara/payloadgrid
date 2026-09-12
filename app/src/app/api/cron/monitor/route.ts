import { NextResponse } from "next/server";
import { runSyntheticMonitoring } from "@/lib/monitoring";
import { constantTimeEquals } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function isAuthorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && constantTimeEquals(request.headers.get("authorization") || "", `Bearer ${secret}`); }

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const result = await runSyntheticMonitoring();
    return NextResponse.json({ ok: true, ...result }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Monitoring run failed" }, { status: 500, headers: { "cache-control": "no-store" } });
  }
}
