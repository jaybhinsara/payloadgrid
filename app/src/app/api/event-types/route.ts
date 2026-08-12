import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertExampleMatchesSchema, assertJsonSchema, compatibilityWarnings, ContractDefinitionError } from "@/lib/event-contracts";
import { requireSql } from "@/lib/db";

const schema = z.object({
  applicationId: z.string().uuid().nullable().optional(),
  name: z.string().trim().regex(/^[a-zA-Z0-9._-]+$/).min(2).max(120),
  description: z.string().trim().max(240).optional(),
  schema: z.record(z.string(), z.unknown()).optional(),
  example: z.unknown().optional(),
  compatibilityMode: z.enum(["backward", "none"]).default("backward")
});

export async function POST(request: Request) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const body = schema.parse(await request.json());
    const contractSchema = body.schema || { $schema: "https://json-schema.org/draft/2020-12/schema", type: "object" };
    assertJsonSchema(contractSchema);
    assertExampleMatchesSchema(contractSchema, body.example);
    const sql = requireSql();
    if (body.applicationId) {
      const [application] = await sql`select 1 from applications where id = ${body.applicationId} and project_id = ${context.project.id}`;
      if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    }
    let [record] = await sql`
      insert into event_types (project_id, application_id, name, description, schema)
      values (${context.project.id}, ${body.applicationId || null}, ${body.name}, ${body.description || null}, ${JSON.stringify(contractSchema)}::jsonb)
      on conflict do nothing
      returning id, application_id, name, description, created_at
    `;
    if (!record) {
      [record] = await sql`update event_types set description=${body.description || null}, schema=${JSON.stringify(contractSchema)}::jsonb where project_id=${context.project.id} and application_id is not distinct from ${body.applicationId || null}::uuid and name=${body.name} returning id, application_id, name, description, created_at`;
    }
    const [current] = await sql`select version, schema from event_contract_versions where event_type_id=${record.id} and status='published' order by version desc limit 1`;
    const compatibility = body.compatibilityMode === "backward" ? compatibilityWarnings(current?.schema as Record<string, unknown> | null, contractSchema) : [];
    const [version] = await sql`
      insert into event_contract_versions (event_type_id, version, schema, example, compatibility_mode, compatibility_warnings, status, created_by, published_at)
      values (${record.id}, ${current ? Number(current.version) + 1 : 1}, ${JSON.stringify(contractSchema)}::jsonb, ${JSON.stringify(body.example ?? null)}::jsonb, ${body.compatibilityMode}, ${JSON.stringify(compatibility)}::jsonb, 'published', ${context.user.id}, now())
      returning version, schema, example, compatibility_mode, compatibility_warnings, status, created_at
    `;
    await writeAudit(context.organization.id, context.user.id, "event_contract.published", "event_type", String(record.id), { version: version.version, applicationId: body.applicationId || null, compatibilityWarnings: compatibility });
    return NextResponse.json({ ok: true, record: { ...record, currentVersion: version } }, { status: 201 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : result.message }, { status: error instanceof z.ZodError || error instanceof ContractDefinitionError ? 400 : result.status });
  }
}
