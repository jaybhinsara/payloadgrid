import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { scheduleReplay } from "@/lib/delivery-operations";
import { processDelivery } from "@/lib/delivery-worker";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const sql = requireSql();
    const [event] = await sql`
      select e.id, e.endpoint_id, count(a.id)::int as attempt_count, ep.rate_limit_per_minute
      from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      left join delivery_attempts a on a.event_id = e.id
      where e.id = ${eventId} and ep.project_id = ${context.project.id}
        and ep.deleted_at is null and ep.is_active = true
        and e.status in ('delivered','failed','dead_letter','cancelled')
      group by e.id, e.endpoint_id, ep.rate_limit_per_minute
      limit 1
    `;
    if (!event) return NextResponse.json({ ok: false, error: "Event or active endpoint not found" }, { status: 404 });

    const result = await scheduleReplay({
      id: String(event.id), endpoint_id: String(event.endpoint_id),
      attempt_count: Number(event.attempt_count), rate_limit_per_minute: Number(event.rate_limit_per_minute)
    });
    if (!result.scheduled) after(() => processDelivery(String(event.id)));
    await writeAudit(context.organization.id, context.user.id, "event.replay_accepted", "event", String(event.id), {
      scheduled: result.scheduled, deliveryMode: result.scheduled ? "qstash" : "fallback", queueError: result.queueError
    });
    return NextResponse.json({ ok: true, status: "accepted", scheduled: result.scheduled, deliveryMode: result.scheduled ? "qstash" : "fallback", queueError: result.queueError }, { status: 202 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}