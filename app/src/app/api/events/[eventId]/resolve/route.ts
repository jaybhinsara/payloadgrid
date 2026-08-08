import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";

const schema = z.object({ note: z.string().trim().max(1000).default("") });

export async function POST(request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const [event] = await sql`
      update webhook_events e set resolved_at = now(), resolved_by = ${context.user.id},
        resolution_note = ${body.note || null}, revenue_at_risk = 0, updated_at = now()
      from endpoints ep
      where e.id = ${eventId} and ep.id = e.endpoint_id and ep.project_id = ${context.project.id}
        and e.status = 'dead_letter' and e.resolved_at is null
      returning e.id
    `;
    if (!event) return NextResponse.json({ ok: false, error: "Only active dead-letter deliveries can be resolved" }, { status: 409 });
    await writeAudit(context.organization.id, context.user.id, "event.resolved", "event", eventId, { note: body.note || null });
    return NextResponse.json({ ok: true, status: "resolved" });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
