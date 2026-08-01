import { after } from "next/server";
import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { processDelivery } from "@/lib/delivery-worker";
import { requireSql } from "@/lib/db";
import { enqueueDelivery } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const { eventId } = await contextValue.params; const sql = requireSql();
    const [event] = await sql`
      select e.id, e.endpoint_id, e.max_retries, ep.rate_limit_per_minute
      from webhook_events e join endpoints ep on ep.id = e.endpoint_id
      where e.id = ${eventId} and ep.project_id = ${context.project.id} limit 1
    `;
    if (!event) return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    const [attemptCount] = await sql`select count(*)::int as count from delivery_attempts where event_id = ${event.id}`;
    const attempt = Number(attemptCount.count || 0) + 1;
    await sql`update webhook_events set status = 'queued', locked_at = null, next_retry_at = null, max_retries = greatest(max_retries, ${attempt + 1}), updated_at = now() where id = ${event.id}`;
    let scheduled = false;
    try {
      const queued = await enqueueDelivery({ eventId: String(event.id), endpointId: String(event.endpoint_id), attempt, rateLimitPerMinute: Number(event.rate_limit_per_minute) });
      scheduled = queued.queued;
    } catch { scheduled = false; }
    if (!scheduled) after(() => processDelivery(String(event.id)));
    await writeAudit(context.organization.id, context.user.id, "event.replay_accepted", "event", String(event.id));
    return NextResponse.json({ ok: true, status: "accepted", scheduled }, { status: 202 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}