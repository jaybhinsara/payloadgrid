import { NextResponse } from "next/server";
import { amountFromPayload, eventTypeFromPayload, providerEventIdFromPayload } from "@/lib/constants";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readPayload(request: Request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function headersToObject(headers: Headers) {
  return Object.fromEntries(headers.entries());
}

export async function POST(request: Request, context: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await context.params;
  try {
    const sql = requireSql();
    const [endpoint] = await sql`
      select id, provider, destination_url, is_active
      from endpoints
      where id = ${endpointId}
      limit 1
    `;

    if (!endpoint || !endpoint.is_active) {
      return NextResponse.json({ ok: false, error: "Unknown or inactive HookIn endpoint" }, { status: 404 });
    }

    const payload = await readPayload(request);
    const headers = headersToObject(request.headers);
    const eventType = eventTypeFromPayload(payload);
    const providerEventId = providerEventIdFromPayload(payload);
    const amount = amountFromPayload(payload);
    const maxRetries = 4;

    const [event] = await sql`
      insert into webhook_events (endpoint_id, provider, provider_event_id, event_type, request_headers, request_body, status, max_retries)
      values (${endpoint.id}, ${endpoint.provider}, ${providerEventId ? String(providerEventId) : null}, ${eventType}, ${JSON.stringify(headers)}::jsonb, ${JSON.stringify(payload)}::jsonb, 'received', ${maxRetries})
      returning id
    `;

    const delivery = await deliverWebhook(endpoint.destination_url, payload, "forward", {
      "x-hookin-original-user-agent": headers["user-agent"] || ""
    });
    const attemptNumber = 1;
    const willRetry = !delivery.ok && shouldRetry(attemptNumber, maxRetries);
    const nextStatus = delivery.ok ? "delivered" : willRetry ? "retrying" : "failed";
    const delayMinutes = nextRetryDelayMinutes(attemptNumber);

    await sql`
      insert into delivery_attempts (event_id, attempt_number, destination_url, response_status, response_body, error, latency_ms)
      values (${event.id}, ${attemptNumber}, ${endpoint.destination_url}, ${delivery.status}, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})
    `;

    await sql`
      update webhook_events
      set
        status = ${nextStatus},
        revenue_at_risk = ${delivery.ok ? 0 : amount},
        retry_count = ${delivery.ok ? 0 : attemptNumber},
        next_retry_at = case when ${willRetry} then now() + (${delayMinutes} * interval '1 minute') else null end,
        last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)},
        updated_at = now()
      where id = ${event.id}
    `;

    return NextResponse.json({ ok: true, eventId: event.id, delivered: delivery.ok, status: nextStatus }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook ingest failed" }, { status: 500 });
  }
}
