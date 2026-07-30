import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const { eventId } = await contextValue.params; const sql = requireSql();
    const [event] = await sql`
      select e.id, e.event_type, e.request_body, e.max_retries, e.revenue_at_risk, ep.destination_url, ep.signing_secret
      from webhook_events e join endpoints ep on ep.id = e.endpoint_id
      where e.id = ${eventId} and ep.project_id = ${context.project.id} limit 1
    `;
    if (!event) return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    const [attemptCount] = await sql`select count(*)::int as count from delivery_attempts where event_id = ${event.id}`;
    const attemptNumber = Number(attemptCount.count || 0) + 1; const maxRetries = Math.max(Number(event.max_retries || 6), attemptNumber + 1);
    const headers = { "payloadgrid-event-type": String(event.event_type) };
    const delivery = await deliverWebhook(String(event.destination_url), event.request_body, "replay", headers, event.signing_secret ? { secret: String(event.signing_secret), deliveryId: String(event.id) } : undefined);
    const willRetry = !delivery.ok && shouldRetry(attemptNumber, maxRetries); const status = delivery.ok ? "delivered" : willRetry ? "retrying" : "failed";
    await sql`insert into delivery_attempts (event_id, attempt_number, destination_url, request_headers, response_status, response_headers, response_body, error, latency_ms) values (${event.id}, ${attemptNumber}, ${event.destination_url}, ${JSON.stringify(headers)}::jsonb, ${delivery.status}, ${JSON.stringify(delivery.responseHeaders)}::jsonb, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})`;
    await sql`update webhook_events set status = ${status}, revenue_at_risk = case when ${delivery.ok} then 0 else revenue_at_risk end, retry_count = case when ${delivery.ok} then retry_count else ${attemptNumber} end, max_retries = ${maxRetries}, next_retry_at = case when ${willRetry} then now() + (${nextRetryDelayMinutes(attemptNumber)} * interval '1 minute') else null end, last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)}, updated_at = now() where id = ${event.id}`;
    await writeAudit(context.organization.id, context.user.id, "event.replayed", "event", String(event.id));
    return NextResponse.json({ ok: true, delivered: delivery.ok, status });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status }); }
}