import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { enforceMonthlyMessageLimit, UsageLimitError } from "@/lib/limits";
import { acceptMessage } from "@/lib/outbound";
import { assertPayloadSize, PayloadLimitError } from "@/lib/payload-limits";

const schema = z.object({ applicationId: z.string().uuid(), eventType: z.string().min(1).max(120), payload: z.unknown() });
export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]); const body = schema.parse(await request.json());
    assertPayloadSize(body.payload);
    await enforceMonthlyMessageLimit(context.project.id);
    const result = await acceptMessage({ projectId: context.project.id, ...body, idempotencyKey: `catalog:${body.applicationId}:${body.eventType}:${Date.now()}`, isSimulation: true });
    return NextResponse.json({ ok: true, ...result }, { status: 202 });
  } catch (error) {
    if (error instanceof UsageLimitError || error instanceof PayloadLimitError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
