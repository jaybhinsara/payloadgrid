import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
const schema = z.object({ name: z.string().trim().regex(/^[a-zA-Z0-9._-]+$/).min(2).max(120), description: z.string().trim().max(240).optional() });
export async function POST(request: Request) {
  try { const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]); const body = schema.parse(await request.json()); const sql = requireSql(); const [record] = await sql`insert into event_types (project_id, name, description) values (${context.project.id}, ${body.name}, ${body.description || null}) on conflict (project_id, name) do update set description = excluded.description returning id, name, description, created_at`; await writeAudit(context.organization.id, context.user.id, "event_type.created", "event_type", String(record.id)); return NextResponse.json({ ok: true, record }, { status: 201 }); }
  catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status }); }
}