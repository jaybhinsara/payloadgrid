import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { normalizeDeliveryHeaders } from "@/lib/destination-adapters";
import { requireSql } from "@/lib/db";
import { planLimits, UsageLimitError } from "@/lib/limits";
import { encryptSecret, randomToken } from "@/lib/security";

export const runtime = "nodejs";
const schema = z.object({
  applicationId: z.string().uuid(), name: z.string().trim().min(2).max(80),
  provider: z.enum(["razorpay", "stripe", "cashfree", "shopify", "custom"]).default("custom"),
  destinationUrl: z.string().url().max(500), eventTypes: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  providerSecret: z.string().trim().max(500).optional(),
  deliveryHeaders: z.record(z.string(), z.string()).default({}),
  circuitBreakerEnabled: z.boolean().default(false), circuitBreakerThreshold: z.number().int().min(20).max(100000).default(100),
  revenueTrackingMode: z.enum(["disabled", "automatic", "custom"]).default("disabled"),
  revenueAmountPath: z.string().trim().max(240).nullable().optional(), revenueCurrencyPath: z.string().trim().max(240).nullable().optional(),
  revenueFixedCurrency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).nullable().optional(),
  revenueAmountUnit: z.enum(["major", "minor"]).default("major")
}).superRefine((value, context) => {
  if (value.revenueTrackingMode === "custom" && !value.revenueAmountPath) context.addIssue({ code: "custom", path: ["revenueAmountPath"], message: "Amount path is required for custom revenue tracking" });
  if (value.revenueTrackingMode === "custom" && !value.revenueCurrencyPath && !value.revenueFixedCurrency) context.addIssue({ code: "custom", path: ["revenueFixedCurrency"], message: "Choose a fixed currency or provide a currency path" });
});

export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const body = schema.parse(await request.json());
    if (body.provider !== "custom" && !body.providerSecret) return NextResponse.json({ ok: false, error: `${body.provider} verification secret is required` }, { status: 400 });
    const destinationUrl = await assertSafeDestinationUrl(body.destinationUrl);
    const sql = requireSql();
    const limits = planLimits(context.organization.plan);
    const [count] = await sql`select count(*)::int as count from endpoints where project_id = ${context.project.id} and deleted_at is null`;
    if (Number(count.count) >= limits.endpoints) throw new UsageLimitError(`Current plan supports up to ${limits.endpoints} endpoints per project`);
    const [application] = await sql`select id from applications where id = ${body.applicationId} and project_id = ${context.project.id} limit 1`;
    if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    const encryptedProviderSecret = body.providerSecret ? encryptSecret(body.providerSecret) : null;
    const deliveryHeaders = normalizeDeliveryHeaders(body.deliveryHeaders);
    const encryptedDeliveryHeaders = Object.keys(deliveryHeaders).length ? encryptSecret(JSON.stringify(deliveryHeaders)) : null;
    const [endpoint] = await sql`
      insert into endpoints (project_id, application_id, name, provider, destination_url, signing_secret, provider_secret_encrypted,
        provider_verification_required, provider_secret_hint, delivery_headers_encrypted, delivery_header_names,
        circuit_breaker_enabled, circuit_breaker_threshold, revenue_tracking_mode, revenue_amount_path,
        revenue_currency_path, revenue_fixed_currency, revenue_amount_unit)
      values (${context.project.id}, ${body.applicationId}, ${body.name}, ${body.provider}, ${destinationUrl}, ${`whsec_${randomToken(24)}`},
        ${encryptedProviderSecret}, ${body.provider !== "custom"}, ${body.providerSecret ? `••••${body.providerSecret.slice(-4)}` : null},
        ${encryptedDeliveryHeaders}, ${Object.keys(deliveryHeaders)},
        ${body.circuitBreakerEnabled}, ${body.circuitBreakerThreshold}, ${body.revenueTrackingMode},
        ${body.revenueAmountPath || null}, ${body.revenueCurrencyPath || null}, ${body.revenueFixedCurrency || null}, ${body.revenueAmountUnit})
      returning id, application_id, name, provider, destination_url, signing_secret, provider_verification_required,
        provider_secret_hint, delivery_header_names, is_active, circuit_breaker_enabled, circuit_breaker_threshold, circuit_state,
        revenue_tracking_mode, revenue_amount_path, revenue_currency_path, revenue_fixed_currency, revenue_amount_unit, created_at
    `;
    for (const eventType of [...new Set(body.eventTypes)]) await sql`insert into endpoint_subscriptions (endpoint_id, event_type) values (${endpoint.id}, ${eventType}) on conflict do nothing`;
    await writeAudit(context.organization.id, context.user.id, "endpoint.created", "endpoint", String(endpoint.id), { applicationId: body.applicationId, provider: body.provider, providerVerification: body.provider !== "custom", revenueTrackingMode: body.revenueTrackingMode });
    return NextResponse.json({ ok: true, endpoint }, { status: 201 });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}
