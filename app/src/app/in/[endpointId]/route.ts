import { after } from "next/server";
import { NextResponse } from "next/server";
import { amountFromPayload, eventTypeFromPayload, providerEventIdFromPayload, safeCapturedHeaders, type Provider } from "@/lib/constants";
import { evaluateCircuitBreaker, notifyCircuitOpened } from "@/lib/circuit-breaker";
import { requireSql } from "@/lib/db";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { enforceInboundRateLimit, enforceMonthlyMessageLimit, planLimits, UsageLimitError } from "@/lib/limits";
import { parseInboundBody } from "@/lib/inbound-content";
import { verifyProviderWebhook } from "@/lib/provider-verification";
import { queueConfigured } from "@/lib/queue";
import { validateEventPayload } from "@/lib/event-contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_PAYLOAD_BYTES = 256 * 1024;

export async function POST(request: Request, contextValue: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await contextValue.params;
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "Payload exceeds the 256 KB plan limit" }, { status: 413 });
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > MAX_PAYLOAD_BYTES) return NextResponse.json({ ok: false, error: "Payload exceeds the 256 KB plan limit" }, { status: 413 });
    const sql = requireSql();
    const [endpoint] = await sql`
      select ep.id, ep.project_id, ep.application_id, ep.provider, ep.destination_url, ep.is_active, ep.provider_secret_encrypted,
        ep.provider_verification_required, ep.rate_limit_per_minute, ep.circuit_breaker_enabled,
        ep.circuit_breaker_threshold, ep.circuit_state, ep.name, ep.revenue_tracking_mode, ep.revenue_amount_path,
        ep.revenue_currency_path, ep.revenue_fixed_currency, ep.revenue_amount_unit, o.id as organization_id, o.plan,
        case when o.temporary_limit_expires_at > now() then o.temporary_message_limit else null end as temporary_message_limit
      from endpoints ep join projects p on p.id=ep.project_id join organizations o on o.id=p.organization_id
      where ep.id = ${endpointId} and ep.deleted_at is null and o.suspended_at is null limit 1
    `;
    if (!endpoint?.is_active) return NextResponse.json({ ok: false, error: "Unknown or inactive PayloadGrid endpoint" }, { status: 404 });
    const limits = planLimits(String(endpoint.plan || "free"));
    await enforceInboundRateLimit(String(endpoint.id), limits.inboundRequestsPerMinute);
    await enforceMonthlyMessageLimit(String(endpoint.project_id), 1, {
      organizationId: String(endpoint.organization_id),
      messagesPerMonth: endpoint.temporary_message_limit ? Number(endpoint.temporary_message_limit) : limits.messagesPerMonth
    });
    const provider = String(endpoint.provider) as Provider;
    const verification = verifyProviderWebhook(provider, rawBody, request.headers, endpoint.provider_secret_encrypted ? String(endpoint.provider_secret_encrypted) : null);
    if (endpoint.provider_verification_required && !verification.verified) return NextResponse.json({ ok: false, error: verification.error || "Provider signature verification failed" }, { status: 401 });
    let parsed;
    try { parsed = parseInboundBody(rawBody, request.headers.get("content-type")); }
    catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook body could not be parsed" }, { status: 400 }); }
    const payload = parsed.payload;
    const eventType = eventTypeFromPayload(payload, provider, request.headers);
    const providerEventId = providerEventIdFromPayload(payload, provider, request.headers);
    const revenue = amountFromPayload(payload, provider, {
      mode: String(endpoint.revenue_tracking_mode) as "disabled" | "automatic" | "custom",
      amountPath: endpoint.revenue_amount_path ? String(endpoint.revenue_amount_path) : null,
      currencyPath: endpoint.revenue_currency_path ? String(endpoint.revenue_currency_path) : null,
      fixedCurrency: endpoint.revenue_fixed_currency ? String(endpoint.revenue_fixed_currency) : null,
      amountUnit: String(endpoint.revenue_amount_unit) as "major" | "minor"
    });
    const headers = safeCapturedHeaders(request.headers);
    const validation = await validateEventPayload(String(endpoint.project_id), endpoint.application_id ? String(endpoint.application_id) : null, eventType, payload);
    const circuit = await evaluateCircuitBreaker({
      id: String(endpoint.id), projectId: String(endpoint.project_id), name: String(endpoint.name),
      enabled: Boolean(endpoint.circuit_breaker_enabled), threshold: Number(endpoint.circuit_breaker_threshold), state: String(endpoint.circuit_state)
    });
    if (circuit.newlyOpened) after(() => notifyCircuitOpened({ id: String(endpoint.id), projectId: String(endpoint.project_id), name: String(endpoint.name), enabled: true, threshold: Number(endpoint.circuit_breaker_threshold), state: "open" }, Number(circuit.current || 0)));
    const initialStatus = circuit.open ? "buffered" : "queued";
    const [event] = await sql`
      with inserted_event as (
        insert into webhook_events (endpoint_id, application_id, direction, provider, provider_event_id, event_type,
          request_headers, request_body, request_content_type, request_raw_body, status, revenue_amount, revenue_currency, max_retries, contract_version, validation_warnings)
        values (${endpoint.id}, ${endpoint.application_id}, 'inbound', ${provider}, ${providerEventId ? String(providerEventId) : null}, ${eventType},
          ${JSON.stringify(headers)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${parsed.contentType}, ${parsed.rawBody}, ${initialStatus}, ${revenue.amount}, ${revenue.currency}, 6, ${validation.contractVersion}, ${JSON.stringify(validation.warnings)}::jsonb)
        on conflict (endpoint_id, provider_event_id) where provider_event_id is not null do nothing
        returning id, status
      ), inserted_job as (
        insert into dispatch_jobs (event_id, status, available_at)
        select id, 'pending', now() from inserted_event where status = 'queued'
        returning event_id
      )
      select id, status, exists(select 1 from inserted_job) as dispatch_pending from inserted_event
    `;
    if (!event) return NextResponse.json({ ok: true, duplicate: true, status: "accepted" }, { status: 200 });
    if (circuit.open) return NextResponse.json({ ok: true, eventId: event.id, status: "buffered", circuitOpen: true }, { status: 202, headers: { "x-payloadgrid-event-id": String(event.id) } });
    if (event.dispatch_pending) after(() => dispatchOutboxBatch(1, String(event.id)));
    return NextResponse.json({ ok: true, eventId: event.id, status: "accepted", verified: verification.verified, queueConfigured: queueConfigured(), contractVersion: validation.contractVersion, validationWarnings: validation.warnings }, { status: 200, headers: { "x-payloadgrid-event-id": String(event.id) } });
  } catch (error) {
    const status = error instanceof UsageLimitError ? error.status : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Webhook ingest failed" }, { status });
  }
}
