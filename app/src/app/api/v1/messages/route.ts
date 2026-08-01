import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { enforceApiRateLimit, enforceMonthlyMessageLimit, UsageLimitError } from "@/lib/limits";
import { acceptMessage } from "@/lib/outbound";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ applicationId: z.string().uuid(), eventType: z.string().trim().min(1).max(120), payload: z.unknown() });

export async function POST(request: Request) {
  try {
    const key = await authenticateApiKey(request);
    if (!key) return NextResponse.json({ ok: false, error: "Invalid or revoked API key" }, { status: 401 });
    await enforceApiRateLimit(key.keyId);
    await enforceMonthlyMessageLimit(key.projectId);
    const body = schema.parse(await request.json());
    const result = await acceptMessage({ projectId: key.projectId, applicationId: body.applicationId, eventType: body.eventType, payload: body.payload, idempotencyKey: request.headers.get("idempotency-key") });
    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof UsageLimitError ? error.status : 400;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Message acceptance failed" }, { status });
  }
}