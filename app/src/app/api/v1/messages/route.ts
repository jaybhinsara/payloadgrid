import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { enforceApiRateLimit, enforceMonthlyMessageLimit, UsageLimitError, usageLimitHeaders } from "@/lib/limits";
import { acceptMessage, MessageScopeError } from "@/lib/outbound";
import { assertPayloadSize, MAX_EVENT_PAYLOAD_BYTES, PayloadLimitError } from "@/lib/payload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const schema = z.object({ applicationId: z.string().uuid(), eventType: z.string().trim().min(1).max(120), payload: z.unknown() });

export async function POST(request: Request) {
  try {
    const key = await authenticateApiKey(request, "messages:write");
    if (!key) return NextResponse.json({ ok: false, error: "Invalid or revoked API key" }, { status: 401 });
    await enforceApiRateLimit(key.keyId, key.apiRequestsPerMinute);
    await enforceMonthlyMessageLimit(key.projectId, 1, { organizationId: key.organizationId, messagesPerMonth: key.messagesPerMonth });
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_EVENT_PAYLOAD_BYTES) throw new PayloadLimitError("Payload exceeds the 256 KB plan limit");
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_EVENT_PAYLOAD_BYTES) throw new PayloadLimitError("Payload exceeds the 256 KB plan limit");
    const body = schema.parse(JSON.parse(rawBody));
    assertPayloadSize(body.payload);
    const result = await acceptMessage({ projectId: key.projectId, applicationId: body.applicationId, eventType: body.eventType, payload: body.payload, idempotencyKey: request.headers.get("idempotency-key") });
    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof UsageLimitError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: usageLimitHeaders(error) });
    }
    if (error instanceof PayloadLimitError) {
      return NextResponse.json({ ok: false, error: error.message }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      return NextResponse.json({ ok: false, error: "Message body is invalid" }, { status: 400 });
    }
    if (error instanceof MessageScopeError) {
      return NextResponse.json({ ok: false, error: "Application was not found in the authenticated project" }, { status: 404, headers: { "cache-control": "no-store" } });
    }
    console.error("Message acceptance failed", error);
    return NextResponse.json({ ok: false, error: "Message acceptance is temporarily unavailable" }, {
      status: 503,
      headers: { "retry-after": "5", "cache-control": "no-store" }
    });
  }
}
