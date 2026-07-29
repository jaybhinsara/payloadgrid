import { NextResponse } from "next/server";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function forward(destinationUrl: string, payload: unknown) {
  const started = Date.now();
  try {
    const response = await fetch(destinationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hookin-replay": "true"
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    return {
      ok: response.ok,
      status: response.status,
      body: (await response.text().catch(() => "")).slice(0, 4000),
      error: null,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: "",
      error: error instanceof Error ? error.message : "Replay failed",
      latencyMs: Date.now() - started
    };
  }
}

export async function POST(_request: Request, context: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await context.params;
  try {
    const sql = requireSql();
    const [event] = await sql`
      select e.id, e.request_body, ep.destination_url
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
    const delivery = await forward(event.destination_url, event.request_body);
    const nextStatus = delivery.ok ? "delivered" : "failed";

    await sql`
      insert into delivery_attempts (event_id, attempt_number, destination_url, response_status, response_body, error, latency_ms)
      values (${event.id}, ${attemptNumber}, ${event.destination_url}, ${delivery.status}, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})
    `;

    await sql`
      update webhook_events
      set status = ${nextStatus}, revenue_at_risk = case when ${delivery.ok} then 0 else revenue_at_risk end, updated_at = now()
      where id = ${event.id}
    `;

    return NextResponse.json({ ok: true, delivered: delivery.ok, status: nextStatus });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Replay failed" }, { status: 500 });
  }
}
