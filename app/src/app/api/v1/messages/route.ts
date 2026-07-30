import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { dispatchMessage } from "@/lib/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ applicationId: z.string().uuid(), eventType: z.string().trim().min(1).max(120), payload: z.unknown() });
export async function POST(request: Request) {
  try { const key = await authenticateApiKey(request); if (!key) return NextResponse.json({ ok: false, error: "Invalid or revoked API key" }, { status: 401 }); const body = schema.parse(await request.json()); const result = await dispatchMessage({ projectId: key.projectId, applicationId: body.applicationId, eventType: body.eventType, payload: body.payload, idempotencyKey: request.headers.get("idempotency-key") }); return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 202 }); }
  catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Message dispatch failed" }, { status: 400 }); }
}