import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { PLAN_LIMITS, UsageLimitError } from "@/lib/limits";
import { randomToken, sha256 } from "@/lib/security";

const schema = z.object({ email: z.string().trim().email(), role: z.enum(["admin", "developer", "viewer"]) });
export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin"]);
    const body = schema.parse(await request.json()); const email = body.email.toLowerCase(); const sql = requireSql();
    if (context.organization.role === "admin" && body.role === "admin") return NextResponse.json({ ok: false, error: "Only the workspace owner can add administrators" }, { status: 403 });
    const [user] = await sql`select id from users where email = ${email} limit 1`;
    if (user) {
      const [existing] = await sql`select role from organization_members where organization_id = ${context.organization.id} and user_id = ${user.id}`;
      if (String(user.id) === context.user.id) return NextResponse.json({ ok: false, error: "Use your account settings to manage your own profile" }, { status: 400 });
      if (existing?.role === "owner") return NextResponse.json({ ok: false, error: "The workspace owner role cannot be changed" }, { status: 403 });
      if (context.organization.role === "admin" && existing?.role === "admin") return NextResponse.json({ ok: false, error: "Only the workspace owner can manage administrators" }, { status: 403 });
      if (!existing) {
        const [usage] = await sql`select count(*)::int as count from organization_members where organization_id = ${context.organization.id}`;
        if (Number(usage.count) >= PLAN_LIMITS.teamMembers) throw new UsageLimitError(`Current plan supports up to ${PLAN_LIMITS.teamMembers} team members`);
      }
      await sql`insert into organization_members (organization_id, user_id, role) values (${context.organization.id}, ${user.id}, ${body.role}) on conflict (organization_id, user_id) do update set role = excluded.role`;
      await writeAudit(context.organization.id, context.user.id, "member.added", "user", String(user.id), { role: body.role });
      return NextResponse.json({ ok: true, added: true });
    }
    const [usage] = await sql`select ((select count(*) from organization_members where organization_id = ${context.organization.id}) + (select count(*) from organization_invitations where organization_id = ${context.organization.id} and accepted_at is null and expires_at > now()))::int as count`;
    if (Number(usage.count) >= PLAN_LIMITS.teamMembers) throw new UsageLimitError(`Current plan supports up to ${PLAN_LIMITS.teamMembers} members and pending invitations`);
    const token = randomToken(32);
    await sql`
      insert into organization_invitations (organization_id, email, role, token_hash, invited_by, expires_at)
      values (${context.organization.id}, ${email}, ${body.role}, ${sha256(token)}, ${context.user.id}, now() + interval '7 days')
      on conflict (organization_id, email) where accepted_at is null
      do update set role = excluded.role, token_hash = excluded.token_hash, invited_by = excluded.invited_by, expires_at = excluded.expires_at
    `;
    await writeAudit(context.organization.id, context.user.id, "invitation.created", "invitation", email, { role: body.role });
    return NextResponse.json({ ok: true, added: false, inviteUrl: `${appUrl()}/signup?invite=${encodeURIComponent(token)}` }, { status: 201 });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}