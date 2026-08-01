import { NextResponse } from "next/server";
import { readSystemHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const health = await readSystemHealth();
    return NextResponse.json(health, { headers: { "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable", database: "unavailable", checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}