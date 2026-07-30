import { NextResponse } from "next/server";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const sql = requireSql();
    const dueEvents = await sql`
      select e.id, e.request_body, e.retry_count, e.max_retries, ep.destination_url
      from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      where e.status = 'retrying'
        and e.next_retry_at is not null
        and e.next_retry_at <= now()
        and ep.is_active = true
      order by e.next_retry_at asc
      limit 10
    `;

    const results = [];

    for (const event of dueEvents) {
      const attemptNumber = Number(event.retry_count || 0) + 1;
      const maxRetries = Number(event.max_retries || 4);
      const delivery = await deliverWebhook(event.destination_url, event.request_body, "retry");
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
          retry_count = ${attemptNumber},
          next_retry_at = case when ${willRetry} then now() + (${delayMinutes} * interval '1 minute') else null end,
          last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)},
          updated_at = now()
        where id = ${event.id}
      `;

      results.push({ eventId: event.id, status: nextStatus, delivered: delivery.ok, attemptNumber });
    }

    return NextResponse.json({ ok: true, processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Retry cron failed" }, { status: 500 });
  }
}
