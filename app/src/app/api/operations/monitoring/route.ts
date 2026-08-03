import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { readMonitoringSummary } from "@/lib/monitoring";
import { requirePlatformOperator } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireSession();
    requirePlatformOperator(context);
    const monitoring = await readMonitoringSummary(true);
    return NextResponse.json({ ok: true, monitoring }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const authError = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: authError.message }, { status: authError.status, headers: { "cache-control": "no-store" } });
  }
}
