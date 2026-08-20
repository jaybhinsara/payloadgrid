import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { enforceApiRateLimit, enforceMonthlyMessageLimit, UsageLimitError } from "@/lib/limits";
import { acceptMessage } from "@/lib/outbound";
import { assertPayloadSize, MAX_BATCH_BODY_BYTES, MAX_BATCH_EVENTS } from "@/lib/payload-limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const eventSchema = z.object({
  applicationId: z.string().uuid(),
  eventType: z.string().trim().min(1).max(120),
  payload: z.unknown(),
  idempotencyKey: z.string().trim().min(1).max(200).optional()
});
const schema = z.object({ events: z.array(eventSchema).min(1).max(MAX_BATCH_EVENTS) });

export async function POST(request: Request) {
  try {
    const key = await authenticateApiKey(request, "messages:write");
    if (!key) return NextResponse.json({ ok: false, error: "Invalid or revoked API key" }, { status: 401 });
    await enforceApiRateLimit(key.keyId, key.apiRequestsPerMinute);
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BATCH_BODY_BYTES) return NextResponse.json({ ok: false, error: "Batch body exceeds 4 MB" }, { status: 413 });
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BATCH_BODY_BYTES) return NextResponse.json({ ok: false, error: "Batch body exceeds 4 MB" }, { status: 413 });
    const body = schema.parse(JSON.parse(rawBody));
    body.events.forEach((event) => assertPayloadSize(event.payload));
    await enforceMonthlyMessageLimit(key.projectId, body.events.length, { organizationId: key.organizationId, messagesPerMonth: key.messagesPerMonth });

    const results = [];
    for (let index = 0; index < body.events.length; index += 10) {
      const chunk = body.events.slice(index, index + 10);
      const accepted = await Promise.all(chunk.map(async (event, offset) => {
        try {
          const result = await acceptMessage({ projectId: key.projectId, ...event });
          return { index: index + offset, ok: true as const, ...result };
        } catch (error) {
          return { index: index + offset, ok: false as const, error: error instanceof Error ? error.message : "Message acceptance failed" };
        }
      }));
      results.push(...accepted);
    }
    const acceptedCount = results.filter((result) => result.ok).length;
    return NextResponse.json({
      ok: acceptedCount === results.length,
      accepted: acceptedCount,
      rejected: results.length - acceptedCount,
      results
    }, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof UsageLimitError ? error.status : error instanceof SyntaxError || error instanceof z.ZodError ? 400 : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Batch acceptance failed" }, { status });
  }
}
