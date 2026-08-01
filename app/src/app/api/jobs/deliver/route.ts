import { Receiver } from "@upstash/qstash";
import { NextResponse } from "next/server";
import { processDelivery } from "@/lib/delivery-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized(request: Request, body: string) {
  const current = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const next = process.env.QSTASH_NEXT_SIGNING_KEY;
  const signature = request.headers.get("upstash-signature");
  if (current && next && signature) {
    const receiver = new Receiver({ currentSigningKey: current, nextSigningKey: next });
    try { return await receiver.verify({ signature, body, url: request.url, upstashRegion: request.headers.get("upstash-region") || undefined }); }
    catch { return false; }
  }
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  if (!(await authorized(request, rawBody))) return NextResponse.json({ ok: false, error: "Unauthorized worker request" }, { status: 401 });
  try {
    const body = JSON.parse(rawBody) as { eventId?: string };
    if (!body.eventId) return NextResponse.json({ ok: false, error: "eventId is required" }, { status: 400 });
    const result = await processDelivery(body.eventId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Delivery worker failed" }, { status: 500 });
  }
}