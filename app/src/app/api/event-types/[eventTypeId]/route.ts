import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertJsonSchema, compatibilityWarnings } from "@/lib/event-contracts";
import { requireSql } from "@/lib/db";

const inputSchema = z.object({ schema: z.record(z.string(), z.unknown()), example: z.unknown().optional(), compatibilityMode: z.enum(["backward", "none"]).default("backward") });

export async function GET(_request: Request, contextValue: { params: Promise<{ eventTypeId: string }> }) {
  try {
    const context = await requireSession();
    const { eventTypeId } = await contextValue.params;
    const sql = requireSql();
    const versions = await sql`select ec.version, ec.schema, ec.example, ec.compatibility_mode, ec.compatibility_warnings, ec.status, ec.created_at, ec.published_at from event_contract_versions ec join event_types et on et.id = ec.event_type_id where ec.event_type_id = ${eventTypeId} and et.project_id = ${context.project.id} order by ec.version desc`;
    return NextResponse.json({ ok: true, versions });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status }); }
}

export async function PATCH(request: Request, contextValue: { params: Promise<{ eventTypeId: string }> }) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const { eventTypeId } = await contextValue.params;
    const body = inputSchema.parse(await request.json()); assertJsonSchema(body.schema);
    const sql = requireSql();
    const [current] = await sql`select ec.schema, ec.version from event_contract_versions ec join event_types et on et.id = ec.event_type_id where ec.event_type_id = ${eventTypeId} and et.project_id = ${context.project.id} and ec.status = 'published' order by ec.version desc limit 1`;
    if (!current) return NextResponse.json({ ok: false, error: "Event contract not found" }, { status: 404 });
    const compatibility = body.compatibilityMode === "backward" ? compatibilityWarnings(current.schema as Record<string, unknown>, body.schema) : [];
    const [version] = await sql`insert into event_contract_versions (event_type_id, version, schema, example, compatibility_mode, compatibility_warnings, status, created_by, published_at) values (${eventTypeId}, ${Number(current.version) + 1}, ${JSON.stringify(body.schema)}::jsonb, ${JSON.stringify(body.example ?? null)}::jsonb, ${body.compatibilityMode}, ${JSON.stringify(compatibility)}::jsonb, 'published', ${context.user.id}, now()) returning version, schema, example, compatibility_mode, compatibility_warnings, status, created_at`;
    await sql`update event_types set schema = ${JSON.stringify(body.schema)}::jsonb where id = ${eventTypeId}`;
    await writeAudit(context.organization.id, context.user.id, "event_contract.published", "event_type", eventTypeId, { version: version.version, compatibilityWarnings: compatibility });
    return NextResponse.json({ ok: true, version, compatible: compatibility.length === 0 }, { status: 201 });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : result.message }, { status: error instanceof z.ZodError ? 400 : result.status }); }
}
