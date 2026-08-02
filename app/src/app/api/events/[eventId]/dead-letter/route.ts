import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { updateMessageStatus } from "@/lib/delivery-worker";

export const runtime = "nodejs";

export async function POST(_request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const sql = requireSql();
    const [event] = await sql`
      update webhook_events e set status = 'dead_letter', dead_lettered_at = now(), cancelled_at = null,
        next_retry_at = null, locked_at = null, updated_at = now()
      from endpoints ep
      where e.id = ${eventId} and ep.id = e.endpoint_id and ep.project_id = ${context.project.id}
        and e.status = 'failed'
      returning e.id, e.message_id
    `;
    if (!event) return NextResponse.json({ ok: false, error: "Only failed deliveries can be moved to dead letter" }, { status: 409 });
    if (event.message_id) await updateMessageStatus(String(event.message_id));
    await writeAudit(context.organization.id, context.user.id, "event.dead_lettered", "event", eventId);
    return NextResponse.json({ ok: true, status: "dead_letter" });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}