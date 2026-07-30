import { NextResponse } from "next/server";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  try {
    const sql = requireSql();
    const [event] = await sql`
      select e.id, e.request_body, e.max_retries, e.revenue_at_risk, ep.destination_url
      from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      where e.id = ${eventId}
      limit 1
    `;

    if (!event) {
      return NextResponse.json({ ok: false, error: "Event not found" }, { status: 404 });
    }

    const [attemptCount] = await sql`select count(*)::int as count from delivery_attempts where event_id = ${event.id}`;
    const attemptNumber = Number(attemptCount.count || 0) + 1;
    const delivery = await deliverWebhook(event.destination_url, event.request_body, "replay");
    const maxRetries = Number(event.max_retries || 4);
    const willRetry = !delivery.ok && shouldRetry(attemptNumber, maxRetries);
    const nextStatus = delivery.ok ? "delivered" : willRetry ? "retrying" : "failed";
    const delayMinutes = nextRetryDelayMinutes(attemptNumber);

    await sql`
      insert into delivery_attempts (event_id, attempt_number, destination_url, response_status, response_body, error, latency_ms)
      values (${event.id}, ${attemptNumber}, ${event.destination_url}, ${delivery.status}, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})
    `;

    await sql`
      update webhook_events
      set
        status = ${nextStatus},
        revenue_at_risk = case when ${delivery.ok} then 0 else revenue_at_risk end,
        retry_count = case when ${delivery.ok} then retry_count else ${attemptNumber} end,
        next_retry_at = case when ${willRetry} then now() + (${delayMinutes} * interval '1 minute') else null end,
        last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)},
        updated_at = now()
      where id = ${event.id}
    `;

    return NextResponse.json({ ok: true, delivered: delivery.ok, status: nextStatus });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Replay failed" }, { status: 500 });
  }
}
