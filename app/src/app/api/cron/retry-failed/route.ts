import { NextResponse } from "next/server";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { requireSql } from "@/lib/db";
import { notifyFailure } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
function isAuthorized(request: Request) { const secret = process.env.CRON_SECRET; return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`; }
export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const sql = requireSql(); const events = await sql`select e.id, e.event_type, e.request_body, e.retry_count, e.max_retries, e.message_id, ep.project_id, ep.destination_url, ep.signing_secret from webhook_events e join endpoints ep on ep.id = e.endpoint_id where e.status = 'retrying' and e.next_retry_at is not null and e.next_retry_at <= now() and ep.is_active = true order by e.next_retry_at asc limit 25`;
    const results = [];
    for (const event of events) {
      const attempt = Number(event.retry_count || 0) + 1; const maxRetries = Number(event.max_retries || 6); const headers = { "payloadgrid-event-type": String(event.event_type) };
      const delivery = await deliverWebhook(String(event.destination_url), event.request_body, "retry", headers, event.signing_secret ? { secret: String(event.signing_secret), deliveryId: String(event.id) } : undefined);
      const willRetry = !delivery.ok && shouldRetry(attempt, maxRetries); const status = delivery.ok ? "delivered" : willRetry ? "retrying" : "failed";
      await sql`insert into delivery_attempts (event_id, attempt_number, destination_url, request_headers, response_status, response_headers, response_body, error, latency_ms) values (${event.id}, ${attempt}, ${event.destination_url}, ${JSON.stringify(headers)}::jsonb, ${delivery.status}, ${JSON.stringify(delivery.responseHeaders)}::jsonb, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})`;
      await sql`update webhook_events set status = ${status}, revenue_at_risk = case when ${delivery.ok} then 0 else revenue_at_risk end, retry_count = ${attempt}, next_retry_at = case when ${willRetry} then now() + (${nextRetryDelayMinutes(attempt)} * interval '1 minute') else null end, last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)}, updated_at = now() where id = ${event.id}`;
      if (event.message_id) { const [summary] = await sql`select count(*)::int as total, count(*) filter (where status = 'delivered')::int as delivered, count(*) filter (where status in ('failed','retrying'))::int as open from webhook_events where message_id = ${event.message_id}`; const messageStatus = Number(summary.delivered) === Number(summary.total) ? 'delivered' : Number(summary.delivered) > 0 ? 'partial' : Number(summary.open) > 0 ? 'processing' : 'failed'; await sql`update messages set status = ${messageStatus}, updated_at = now() where id = ${event.message_id}`; }
      if (!delivery.ok) await notifyFailure({ projectId: String(event.project_id), eventId: String(event.id), eventType: String(event.event_type), error: delivery.error || `Destination HTTP ${delivery.status}` });
      results.push({ eventId: event.id, status, delivered: delivery.ok, attemptNumber: attempt });
    }
    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Retry cron failed" }, { status: 500 }); }
}