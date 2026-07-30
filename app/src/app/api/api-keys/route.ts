import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { createApiKey } from "@/lib/security";

const schema = z.object({ name: z.string().trim().min(2).max(80) });
export async function GET() {
  try { const context = await requireSession(); const sql = requireSql(); const keys = await sql`select id, name, key_prefix, last_used_at, created_at, revoked_at from api_keys where project_id = ${context.project.id} order by created_at desc`; return NextResponse.json({ ok: true, keys }); }
  catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status }); }
}
export async function POST(request: Request) {
  try { const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]); const body = schema.parse(await request.json()); const sql = requireSql(); const key = createApiKey(); const [record] = await sql`insert into api_keys (project_id, name, key_prefix, key_hash, created_by) values (${context.project.id}, ${body.name}, ${key.prefix}, ${key.hash}, ${context.user.id}) returning id, name, key_prefix, created_at`; await writeAudit(context.organization.id, context.user.id, "api_key.created", "api_key", String(record.id)); return NextResponse.json({ ok: true, key: record, token: key.token }, { status: 201 }); }
  catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status }); }
}