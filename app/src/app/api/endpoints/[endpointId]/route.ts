import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { requireSql } from "@/lib/db";
import { encryptSecret, randomToken } from "@/lib/security";

export const runtime = "nodejs";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  destinationUrl: z.string().url().max(500).optional(),
  eventTypes: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
  isActive: z.boolean().optional(),
  rotateSigningSecret: z.boolean().optional(),
  providerSecret: z.string().trim().min(1).max(500).optional()
}).refine((value) => Object.values(value).some((item) => item !== undefined), "No endpoint changes supplied");

type RouteContext = { params: Promise<{ endpointId: string }> };

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const { endpointId } = await contextValue.params;
    const body = updateSchema.parse(await request.json());
    const sql = requireSql();
    const [existing] = await sql`
      select id, provider from endpoints
      where id = ${endpointId} and project_id = ${context.project.id} and deleted_at is null
      limit 1
    `;
    if (!existing) return NextResponse.json({ ok: false, error: "Endpoint not found" }, { status: 404 });

    const destinationUrl = body.destinationUrl ? await assertSafeDestinationUrl(body.destinationUrl) : null;
    const providerSecret = body.providerSecret ? encryptSecret(body.providerSecret) : null;
    const signingSecret = body.rotateSigningSecret ? `whsec_${randomToken(24)}` : null;
    await sql`
      update endpoints set
        name = case when ${body.name !== undefined} then ${body.name || null} else name end,
        destination_url = case when ${destinationUrl !== null} then ${destinationUrl} else destination_url end,
        is_active = case when ${body.isActive !== undefined} then ${body.isActive ?? false} else is_active end,
        signing_secret = case when ${signingSecret !== null} then ${signingSecret} else signing_secret end,
        provider_secret_encrypted = case when ${providerSecret !== null} then ${providerSecret} else provider_secret_encrypted end,
        provider_secret_hint = case when ${body.providerSecret !== undefined} then ${body.providerSecret ? `••••${body.providerSecret.slice(-4)}` : null} else provider_secret_hint end,
        provider_verification_required = case when ${body.providerSecret !== undefined} then ${String(existing.provider) !== "custom"} else provider_verification_required end,
        updated_at = now()
      where id = ${endpointId}
    `;

    if (body.eventTypes !== undefined) {
      await sql`delete from endpoint_subscriptions where endpoint_id = ${endpointId}`;
      for (const eventType of [...new Set(body.eventTypes)]) {
        await sql`insert into endpoint_subscriptions (endpoint_id, event_type) values (${endpointId}, ${eventType}) on conflict do nothing`;
      }
    }

    const [endpoint] = await sql`
      select ep.id, ep.application_id, ep.name, ep.provider, ep.destination_url, ep.signing_secret,
        ep.provider_verification_required, ep.provider_secret_hint, ep.is_active, ep.created_at,
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