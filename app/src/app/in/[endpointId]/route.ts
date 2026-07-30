import { NextResponse } from "next/server";
import { amountFromPayload, eventTypeFromPayload, providerEventIdFromPayload } from "@/lib/constants";
import { deliverWebhook, nextRetryDelayMinutes, shouldRetry } from "@/lib/delivery";
import { requireSql } from "@/lib/db";
import { notifyFailure } from "@/lib/alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function readPayload(request: Request) { const text = await request.text(); if (!text) return {}; try { return JSON.parse(text); } catch { return { raw: text }; } }

export async function POST(request: Request, contextValue: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await contextValue.params;
  try {
    const sql = requireSql(); const [endpoint] = await sql`select id, project_id, application_id, provider, destination_url, signing_secret, is_active from endpoints where id = ${endpointId} limit 1`;
    if (!endpoint || !endpoint.is_active) return NextResponse.json({ ok: false, error: "Unknown or inactive PayloadGrid endpoint" }, { status: 404 });
    const payload = await readPayload(request); const headers = Object.fromEntries(request.headers.entries()); const eventType = eventTypeFromPayload(payload); const providerEventId = providerEventIdFromPayload(payload); const amount = amountFromPayload(payload); const maxRetries = 6;
    const [event] = await sql`insert into webhook_events (endpoint_id, application_id, direction, provider, provider_event_id, event_type, request_headers, request_body, status, max_retries) values (${endpoint.id}, ${endpoint.application_id}, 'inbound', ${endpoint.provider}, ${providerEventId ? String(providerEventId) : null}, ${eventType}, ${JSON.stringify(headers)}::jsonb, ${JSON.stringify(payload)}::jsonb, 'received', ${maxRetries}) returning id`;
    const forwardHeaders = { "x-payloadgrid-original-user-agent": headers["user-agent"] || "", "payloadgrid-event-type": eventType };
    const delivery = await deliverWebhook(String(endpoint.destination_url), payload, "forward", forwardHeaders, endpoint.signing_secret ? { secret: String(endpoint.signing_secret), deliveryId: String(event.id) } : undefined);
    const willRetry = !delivery.ok && shouldRetry(1, maxRetries); const status = delivery.ok ? "delivered" : willRetry ? "retrying" : "failed";
    await sql`insert into delivery_attempts (event_id, attempt_number, destination_url, request_headers, response_status, response_headers, response_body, error, latency_ms) values (${event.id}, 1, ${endpoint.destination_url}, ${JSON.stringify(forwardHeaders)}::jsonb, ${delivery.status}, ${JSON.stringify(delivery.responseHeaders)}::jsonb, ${delivery.body}, ${delivery.error}, ${delivery.latencyMs})`;
    await sql`update webhook_events set status = ${status}, revenue_at_risk = ${delivery.ok ? 0 : amount}, retry_count = ${delivery.ok ? 0 : 1}, next_retry_at = case when ${willRetry} then now() + (${nextRetryDelayMinutes(1)} * interval '1 minute') else null end, last_error = ${delivery.error || (delivery.ok ? null : `Destination HTTP ${delivery.status}`)}, updated_at = now() where id = ${event.id}`;
    if (!delivery.ok) await notifyFailure({ projectId: String(endpoint.project_id), eventId: String(event.id), eventType, error: delivery.error || `Destination HTTP ${delivery.status}` });
    return NextResponse.json({ ok: true, eventId: event.id, delivered: delivery.ok, status }, { status: 202 });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook ingest failed" }, { status: 500 }); }
}