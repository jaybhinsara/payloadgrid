import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { readSystemHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const health = await readSystemHealth(context.project.id);
    return NextResponse.json({ ok: true, health }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const authError = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: authError.message }, { status: authError.status, headers: { "cache-control": "no-store" } });
  }
}
