import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
export async function DELETE(_request: Request, contextValue: { params: Promise<{ keyId: string }> }) {
  try { const context = await requireSession(); requireRole(context, ["owner", "admin"]); const { keyId } = await contextValue.params; const sql = requireSql(); const result = await sql`update api_keys set revoked_at = now() where id = ${keyId} and project_id = ${context.project.id} and revoked_at is null returning id`; if (!result.length) return NextResponse.json({ ok: false, error: "API key not found" }, { status: 404 }); await writeAudit(context.organization.id, context.user.id, "api_key.revoked", "api_key", keyId); return NextResponse.json({ ok: true }); }
  catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status }); }
}