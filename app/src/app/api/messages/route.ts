import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { enforceMonthlyMessageLimit, UsageLimitError } from "@/lib/limits";
import { acceptMessage } from "@/lib/outbound";

const schema = z.object({ applicationId: z.string().uuid(), eventType: z.string().trim().min(1).max(120), payload: z.unknown() });
export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    await enforceMonthlyMessageLimit(context.project.id);
    const body = schema.parse(await request.json());
    const result = await acceptMessage({ projectId: context.project.id, applicationId: body.applicationId, eventType: body.eventType, payload: body.payload, idempotencyKey: request.headers.get("idempotency-key") });
    await writeAudit(context.organization.id, context.user.id, "message.accepted", "message", result.messageId, { eventType: body.eventType });
    return NextResponse.json({ ok: true, ...result }, { status: result.duplicate ? 200 : 202 });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}