import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { randomToken, sha256 } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email(), role: z.enum(["admin", "developer", "viewer"]) });
export async function POST(request: Request) {
  try { const context = await requireSession(); requireRole(context, ["owner", "admin"]); const body = schema.parse(await request.json()); const email = body.email.toLowerCase(); const sql = requireSql(); const [user] = await sql`select id from users where email = ${email} limit 1`;
    if (user) { await sql`insert into organization_members (organization_id, user_id, role) values (${context.organization.id}, ${user.id}, ${body.role}) on conflict (organization_id, user_id) do update set role = excluded.role`; await writeAudit(context.organization.id, context.user.id, "member.added", "user", String(user.id), { role: body.role }); return NextResponse.json({ ok: true, added: true }); }
    const token = randomToken(32); await sql`insert into organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at) values (${context.organization.id}, ${email}, ${body.role}, ${sha256(token)}, ${context.user.id}, now() + interval '7 days')`; await writeAudit(context.organization.id, context.user.id, "invitation.created", "invitation", email, { role: body.role }); return NextResponse.json({ ok: true, added: false, inviteUrl: `${appUrl()}/signup?invite=${encodeURIComponent(token)}` }, { status: 201 }); }
  catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status }); }
}