import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { acceptMessage } from "@/lib/outbound";

const schema = z.object({ applicationId: z.string().uuid(), eventType: z.string().min(1).max(120), payload: z.unknown() });
export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]); const body = schema.parse(await request.json());
    const result = await acceptMessage({ projectId: context.project.id, ...body, idempotencyKey: `catalog:${body.applicationId}:${body.eventType}:${Date.now()}` });
    return NextResponse.json({ ok: true, ...result }, { status: 202 });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : result.message }, { status: error instanceof z.ZodError ? 400 : result.status }); }
}
