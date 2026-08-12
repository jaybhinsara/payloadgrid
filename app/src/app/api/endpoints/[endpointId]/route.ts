import { NextResponse } from "next/server";
import { after } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { normalizeDeliveryHeaders } from "@/lib/destination-adapters";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { requireSql } from "@/lib/db";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { encryptSecret, randomToken } from "@/lib/security";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  destinationUrl: z.string().url().max(500).optional(),
  eventTypes: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  isActive: z.boolean().optional(),
  rotateSigningSecret: z.boolean().optional(),
  providerSecret: z.string().trim().min(1).max(500).optional(),
  deliveryHeaders: z.record(z.string(), z.string()).optional(),
  circuitBreakerEnabled: z.boolean().optional(),
  circuitBreakerThreshold: z.number().int().min(20).max(100000).optional(),
  circuitState: z.enum(["closed", "open"]).optional(),
  revenueTrackingMode: z.enum(["disabled", "automatic", "custom"]).optional(),
  revenueAmountPath: z.string().trim().max(240).nullable().optional(),
  revenueCurrencyPath: z.string().trim().max(240).nullable().optional(),
  revenueFixedCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
  revenueAmountUnit: z.enum(["major", "minor"]).optional()
}).refine((value) => Object.values(value).some((item) => item !== undefined), "No endpoint changes supplied").superRefine((value, context) => {
  if (value.revenueTrackingMode === "custom" && !value.revenueAmountPath) context.addIssue({ code: "custom", path: ["revenueAmountPath"], message: "Amount path is required for custom revenue tracking" });
  if (value.revenueTrackingMode === "custom" && !value.revenueCurrencyPath && !value.revenueFixedCurrency) context.addIssue({ code: "custom", path: ["revenueFixedCurrency"], message: "Choose a fixed currency or provide a currency path" });
});

type RouteContext = { params: Promise<{ endpointId: string }> };

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const { endpointId } = await contextValue.params;
    const body = updateSchema.parse(await request.json());
    const sql = requireSql();
    const [existing] = await sql`
      select id, provider, rate_limit_per_minute from endpoints
      where id = ${endpointId} and project_id = ${context.project.id} and deleted_at is null
      limit 1
    `;
    if (!existing) return NextResponse.json({ ok: false, error: "Endpoint not found" }, { status: 404 });

    const destinationUrl = body.destinationUrl ? await assertSafeDestinationUrl(body.destinationUrl) : null;
    const providerSecret = body.providerSecret ? encryptSecret(body.providerSecret) : null;
    const deliveryHeaders = body.deliveryHeaders ? normalizeDeliveryHeaders(body.deliveryHeaders) : null;
    const encryptedDeliveryHeaders = deliveryHeaders && Object.keys(deliveryHeaders).length ? encryptSecret(JSON.stringify(deliveryHeaders)) : null;
    const signingSecret = body.rotateSigningSecret ? `whsec_${randomToken(24)}` : null;
    await sql`
      update endpoints set
        name = case when ${body.name !== undefined} then ${body.name || null} else name end,
        destination_url = case when ${destinationUrl !== null} then ${destinationUrl} else destination_url end,
        is_active = case when ${body.isActive !== undefined} then ${body.isActive ?? false} else is_active end,
        previous_signing_secret = case when ${signingSecret !== null} then signing_secret else previous_signing_secret end,
        previous_signing_secret_expires_at = case when ${signingSecret !== null} then now() + interval '24 hours' else previous_signing_secret_expires_at end,
        signing_secret = case when ${signingSecret !== null} then ${signingSecret} else signing_secret end,
        provider_secret_encrypted = case when ${providerSecret !== null} then ${providerSecret} else provider_secret_encrypted end,
        provider_secret_hint = case when ${body.providerSecret !== undefined} then ${body.providerSecret ? `••••${body.providerSecret.slice(-4)}` : null} else provider_secret_hint end,
        provider_verification_required = case when ${body.providerSecret !== undefined} then ${String(existing.provider) !== "custom"} else provider_verification_required end,
        delivery_headers_encrypted = case when ${body.deliveryHeaders !== undefined} then ${encryptedDeliveryHeaders} else delivery_headers_encrypted end,
        delivery_header_names = case when ${body.deliveryHeaders !== undefined} then ${deliveryHeaders ? Object.keys(deliveryHeaders) : []} else delivery_header_names end,
        circuit_breaker_enabled = coalesce(${body.circuitBreakerEnabled ?? null}, circuit_breaker_enabled),
        circuit_breaker_threshold = coalesce(${body.circuitBreakerThreshold ?? null}, circuit_breaker_threshold),
        circuit_state = coalesce(${body.circuitState ?? null}, circuit_state),
        circuit_opened_at = case when ${body.circuitState === "closed"} then null when ${body.circuitState === "open"} then now() else circuit_opened_at end,
        revenue_tracking_mode = coalesce(${body.revenueTrackingMode ?? null}, revenue_tracking_mode),
        revenue_amount_path = case when ${body.revenueAmountPath !== undefined} then ${body.revenueAmountPath || null} else revenue_amount_path end,
        revenue_currency_path = case when ${body.revenueCurrencyPath !== undefined} then ${body.revenueCurrencyPath || null} else revenue_currency_path end,
        revenue_fixed_currency = case when ${body.revenueFixedCurrency !== undefined} then ${body.revenueFixedCurrency || null} else revenue_fixed_currency end,
        revenue_amount_unit = coalesce(${body.revenueAmountUnit ?? null}, revenue_amount_unit),
        updated_at = now()
      where id = ${endpointId}
    `;

    if (body.eventTypes !== undefined) {
      await sql`delete from endpoint_subscriptions where endpoint_id = ${endpointId}`;
      for (const eventType of [...new Set(body.eventTypes)]) {
        await sql`insert into endpoint_subscriptions (endpoint_id, event_type) values (${endpointId}, ${eventType}) on conflict do nothing`;
      }
    }
    if (body.circuitState === "closed") {
      const buffered = await sql`
        with resumed as (
          update webhook_events set status = 'queued', updated_at = now()
          where endpoint_id = ${endpointId} and status = 'buffered'
          returning id
        ), scheduled as (
          insert into dispatch_jobs (event_id, status, available_at, last_error, locked_at, qstash_message_id, published_at, updated_at)
          select id, 'pending', now(), null, null, null, null, now() from resumed
          on conflict (event_id) do update set status = 'pending', available_at = now(), last_error = null,
            locked_at = null, qstash_message_id = null, published_at = null, updated_at = now()
          returning event_id
        )
        select event_id as id from scheduled
      `;
      await sql`insert into circuit_breaker_events (endpoint_id, state, reason) values (${endpointId}, 'closed', 'Manually resumed from dashboard')`;
      if (buffered.length) after(() => dispatchOutboxBatch(Math.min(buffered.length, 100)));
    }

    const [endpoint] = await sql`
      select ep.id, ep.application_id, ep.name, ep.provider, ep.destination_url, ep.signing_secret,
        ep.provider_verification_required, ep.provider_secret_hint, ep.delivery_header_names, ep.is_active, ep.circuit_breaker_enabled,
        ep.circuit_breaker_threshold, ep.circuit_state, ep.circuit_opened_at, ep.revenue_tracking_mode,
        ep.revenue_amount_path, ep.revenue_currency_path, ep.revenue_fixed_currency, ep.revenue_amount_unit, ep.created_at,
        coalesce((select array_agg(s.event_type order by s.event_type) from endpoint_subscriptions s where s.endpoint_id = ep.id), '{}') as event_types
      from endpoints ep where ep.id = ${endpointId}
    `;
    await writeAudit(context.organization.id, context.user.id, "endpoint.updated", "endpoint", endpointId, {
      changedFields: Object.keys(body).filter((key) => key !== "providerSecret"),
      providerSecretRotated: Boolean(body.providerSecret),
      signingSecretRotated: Boolean(body.rotateSigningSecret)
    });
    return NextResponse.json({ ok: true, endpoint });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const { endpointId } = await contextValue.params;
    const sql = requireSql();
    const [endpoint] = await sql`
      update endpoints set is_active = false, deleted_at = now(), updated_at = now()
      where id = ${endpointId} and project_id = ${context.project.id} and deleted_at is null
      returning id
    `;
    if (!endpoint) return NextResponse.json({ ok: false, error: "Endpoint not found" }, { status: 404 });
    await writeAudit(context.organization.id, context.user.id, "endpoint.deleted", "endpoint", endpointId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}
