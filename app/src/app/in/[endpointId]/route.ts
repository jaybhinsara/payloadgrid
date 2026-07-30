import { NextResponse } from "next/server";
import { amountFromPayload, eventTypeFromPayload, providerEventIdFromPayload } from "@/lib/constants";
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

async function forward(destinationUrl: string, payload: unknown, headers: Record<string, string>) {
  const started = Date.now();
  try {
    const response = await fetch(destinationUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-hookin-forwarded": "true",
        "x-hookin-original-user-agent": headers["user-agent"] || ""
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000)
    });
    const responseBody = await response.text().catch(() => "");
    return {
      ok: response.ok,
      status: response.status,
      body: responseBody.slice(0, 4000),
      error: null,
      latencyMs: Date.now() - started
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      body: "",
      error: error instanceof Error ? error.message : "Forwarding failed",
      latencyMs: Date.now() - started
    };
  }
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

    const [event] = await sql`
      insert into webhook_events (endpoint_id, provider, provider_event_id, event_type, request_headers, request_body, status)
      values (${endpoint.id}, ${endpoint.provider}, ${providerEventId ? String(providerEventId) : null}, ${eventType}, ${JSON.stringify(headers)}::jsonb, ${JSON.stringify(payload)}::jsonb, 'received')
      returning id
    `;

    const delivery = await forward(endpoint.destination_url, payload, headers);
    const nextStatus = delivery.ok ? "delivered" : "failed";

    await sql`
      insert into delivery_attempts (event_id, attempt_number, destination_url, response_status, response_body, error, latency_ms)
      values (${event.id}, 1, ${endpoint.destination_url}, ${delivery.status}, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})
    `;

    await sql`
      update webhook_events
      set status = ${nextStatus}, revenue_at_risk = ${delivery.ok ? 0 : amount}, updated_at = now()
      where id = ${event.id}
    `;

    return NextResponse.json({ ok: true, eventId: event.id, delivered: delivery.ok }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook ingest failed" }, { status: 500 });
  }
}

