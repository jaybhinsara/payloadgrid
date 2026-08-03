import { NextResponse } from "next/server";
import { readPublicHealth } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const health = await readPublicHealth();
    return NextResponse.json(health, { headers: { "cache-control": "no-store" } });
  } catch {
    const outage = { api: "outage", dashboard: "outage", inboundWebhooks: "outage", outboundDelivery: "outage", scheduledRetries: "outage" };
    return NextResponse.json({ status: "outage", services: outage, checkedAt: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
