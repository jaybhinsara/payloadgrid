import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { requireSql } from "@/lib/db";
import { BETA_LIMITS, UsageLimitError } from "@/lib/limits";
import { encryptSecret, randomToken } from "@/lib/security";

export const runtime = "nodejs";
const schema = z.object({
  applicationId: z.string().uuid(), name: z.string().trim().min(2).max(80),
  provider: z.enum(["razorpay", "stripe", "cashfree", "shopify", "custom"]).default("custom"),
  destinationUrl: z.string().url().max(500), eventTypes: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  providerSecret: z.string().trim().max(500).optional()
});

export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const body = schema.parse(await request.json());
    if (body.provider !== "custom" && !body.providerSecret) return NextResponse.json({ ok: false, error: `${body.provider} verification secret is required` }, { status: 400 });
    const destinationUrl = await assertSafeDestinationUrl(body.destinationUrl);
    const sql = requireSql();
    const [count] = await sql`select count(*)::int as count from endpoints where project_id = ${context.project.id}`;
    if (Number(count.count) >= BETA_LIMITS.endpoints) throw new UsageLimitError(`Public beta supports up to ${BETA_LIMITS.endpoints} endpoints per project`);
    const [application] = await sql`select id from applications where id = ${body.applicationId} and project_id = ${context.project.id} limit 1`;
    if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    const encryptedProviderSecret = body.providerSecret ? encryptSecret(body.providerSecret) : null;
    const [endpoint] = await sql`
      insert into endpoints (project_id, application_id, name, provider, destination_url, signing_secret, provider_secret_encrypted, provider_verification_required, provider_secret_hint)
      values (${context.project.id}, ${body.applicationId}, ${body.name}, ${body.provider}, ${destinationUrl}, ${`whsec_${randomToken(24)}`}, ${encryptedProviderSecret}, ${body.provider !== "custom"}, ${body.providerSecret ? `••••${body.providerSecret.slice(-4)}` : null})
      returning id, application_id, name, provider, destination_url, signing_secret, provider_verification_required, provider_secret_hint, is_active, created_at
    `;
    for (const eventType of [...new Set(body.eventTypes)]) await sql`insert into endpoint_subscriptions (endpoint_id, event_type) values (${endpoint.id}, ${eventType}) on conflict do nothing`;
    await writeAudit(context.organization.id, context.user.id, "endpoint.created", "endpoint", String(endpoint.id), { applicationId: body.applicationId, provider: body.provider, providerVerification: body.provider !== "custom" });
    return NextResponse.json({ ok: true, endpoint }, { status: 201 });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}