import { after } from "next/server";
import { NextResponse } from "next/server";
import { amountFromPayload, eventTypeFromPayload, providerEventIdFromPayload, safeCapturedHeaders, type Provider } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { processDelivery } from "@/lib/delivery-worker";
import { enforceInboundRateLimit, enforceMonthlyMessageLimit, UsageLimitError } from "@/lib/limits";
import { verifyProviderWebhook } from "@/lib/provider-verification";
import { enqueueDelivery, queueConfigured } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_PAYLOAD_BYTES = 256 * 1024;

export async function POST(request: Request, contextValue: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await contextValue.params;
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "Payload exceeds the 256 KB public beta limit" }, { status: 413 });
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "Payload exceeds the 256 KB public beta limit" }, { status: 413 });
    const sql = requireSql();
    const [endpoint] = await sql`
      select id, project_id, application_id, provider, destination_url, is_active, provider_secret_encrypted,
        provider_verification_required, rate_limit_per_minute
      from endpoints where id = ${endpointId} limit 1
    `;
    if (!endpoint?.is_active) return NextResponse.json({ ok: false, error: "Unknown or inactive PayloadGrid endpoint" }, { status: 404 });
    await enforceInboundRateLimit(String(endpoint.id));
    await enforceMonthlyMessageLimit(String(endpoint.project_id));
    const provider = String(endpoint.provider) as Provider;
    const verification = verifyProviderWebhook(provider, rawBody, request.headers, endpoint.provider_secret_encrypted ? String(endpoint.provider_secret_encrypted) : null);
    if (endpoint.provider_verification_required && !verification.verified) return NextResponse.json({ ok: false, error: verification.error || "Provider signature verification failed" }, { status: 401 });
    let payload: unknown;
    try { payload = rawBody ? JSON.parse(rawBody) : {}; }
    catch { return NextResponse.json({ ok: false, error: "Webhook body must be valid JSON" }, { status: 400 }); }
    const eventType = eventTypeFromPayload(payload, provider, request.headers);
    const providerEventId = providerEventIdFromPayload(payload, provider, request.headers);
    const revenue = amountFromPayload(payload, provider);
    const headers = safeCapturedHeaders(request.headers);
    const [event] = await sql`
      insert into webhook_events (endpoint_id, application_id, direction, provider, provider_event_id, event_type, request_headers, request_body, status, revenue_amount, revenue_currency, max_retries)
      values (${endpoint.id}, ${endpoint.application_id}, 'inbound', ${provider}, ${providerEventId ? String(providerEventId) : null}, ${eventType}, ${JSON.stringify(headers)}::jsonb, ${JSON.stringify(payload)}::jsonb, 'queued', ${revenue.amount}, ${revenue.currency}, 6)
      on conflict (endpoint_id, provider_event_id) where provider_event_id is not null do nothing
      returning id
    `;
    if (!event) return NextResponse.json({ ok: true, duplicate: true, status: "accepted" }, { status: 200 });
    let scheduled = false;
    try {
      const queued = await enqueueDelivery({ eventId: String(event.id), endpointId: String(endpoint.id), attempt: 1, rateLimitPerMinute: Number(endpoint.rate_limit_per_minute) });
      scheduled = queued.queued;
    } catch { scheduled = false; }
    if (!scheduled) after(() => processDelivery(String(event.id)));
    return NextResponse.json({ ok: true, eventId: event.id, status: "accepted", verified: verification.verified, queueConfigured: queueConfigured() }, { status: 200, headers: { "x-payloadgrid-event-id": String(event.id) } });
  } catch (error) {
    const status = error instanceof UsageLimitError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook ingest failed" }, { status });
  }
}