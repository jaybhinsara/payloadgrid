import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { randomToken } from "@/lib/security";

export const runtime = "nodejs";
const schema = z.object({
  applicationId: z.string().uuid(), name: z.string().trim().min(2).max(80),
  provider: z.enum(["razorpay", "stripe", "cashfree", "shopify", "custom"]).default("custom"),
  destinationUrl: z.string().url().max(500), eventTypes: z.array(z.string().trim().min(1).max(120)).max(30).default([])
});

export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const body = schema.parse(await request.json()); const sql = requireSql();
    const [application] = await sql`select id from applications where id = ${body.applicationId} and project_id = ${context.project.id} limit 1`;
    if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    const [endpoint] = await sql`
      insert into endpoints (project_id, application_id, name, provider, destination_url, signing_secret)
      values (${context.project.id}, ${body.applicationId}, ${body.name}, ${body.provider}, ${body.destinationUrl}, ${`whsec_${randomToken(24)}`})
      returning id, application_id, name, provider, destination_url, signing_secret, is_active, created_at
    `;
    for (const eventType of [...new Set(body.eventTypes)]) await sql`insert into endpoint_subscriptions (endpoint_id, event_type) values (${endpoint.id}, ${eventType}) on conflict do nothing`;
    await writeAudit(context.organization.id, context.user.id, "endpoint.created", "endpoint", String(endpoint.id), { applicationId: body.applicationId });
    return NextResponse.json({ ok: true, endpoint }, { status: 201 });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status }); }
}