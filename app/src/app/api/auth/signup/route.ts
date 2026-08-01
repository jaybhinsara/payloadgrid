import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { createAuthToken, emailDeliveryConfigured, sendAuthEmail } from "@/lib/email";
import { requireSql } from "@/lib/db";
import { hashPassword, randomToken, sha256, slugify } from "@/lib/security";

export const runtime = "nodejs";
const schema = z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(200), password: z.string().min(10).max(128), organizationName: z.string().trim().min(2).max(100).optional(), inviteToken: z.string().min(20).optional() });

export async function POST(request: Request) {
  try {
    const sql = requireSql(); const body = schema.parse(await request.json()); const email = body.email.toLowerCase();
    const [existing] = await sql`select id from users where email = ${email} limit 1`;
    if (existing) return NextResponse.json({ ok: false, error: "An account with this email already exists. Sign in before joining the invited workspace." }, { status: 409 });
    const passwordHash = await hashPassword(body.password); const requiresVerification = emailDeliveryConfigured();
    let user: Record<string, unknown>;
    if (body.inviteToken) {
      const [invitation] = await sql`select id, organization_id, email, role from organization_invitations where token_hash = ${sha256(body.inviteToken)} and accepted_at is null and expires_at > now() limit 1`;
      if (!invitation || String(invitation.email).toLowerCase() !== email) return NextResponse.json({ ok: false, error: "This invitation is invalid, expired, or belongs to another email." }, { status: 400 });
      [user] = await sql`insert into users (name, email, password_hash, email_verified_at, verification_required) values (${body.name}, ${email}, ${passwordHash}, ${requiresVerification ? null : new Date().toISOString()}, ${requiresVerification}) returning id, name, email`;
      await sql`insert into organization_members (organization_id, user_id, role) values (${invitation.organization_id}, ${user.id}, ${invitation.role})`;
      await sql`update organization_invitations set accepted_at = now() where id = ${invitation.id}`;
    } else {
      if (!body.organizationName) return NextResponse.json({ ok: false, error: "Workspace name is required" }, { status: 400 });
      const suffix = randomToken(5).toLowerCase(); const organizationSlug = `${slugify(body.organizationName)}-${suffix}`; const projectSlug = `${organizationSlug}-production`;
      [user] = await sql`insert into users (name, email, password_hash, email_verified_at, verification_required) values (${body.name}, ${email}, ${passwordHash}, ${requiresVerification ? null : new Date().toISOString()}, ${requiresVerification}) returning id, name, email`;
      const [organization] = await sql`insert into organizations (name, slug) values (${body.organizationName}, ${organizationSlug}) returning id`;
      await sql`insert into organization_members (organization_id, user_id, role) values (${organization.id}, ${user.id}, 'owner')`;
      const [project] = await sql`insert into projects (organization_id, name, slug, environment) values (${organization.id}, 'Production', ${projectSlug}, 'production') returning id`;
      await sql`insert into applications (project_id, name, uid, description) values (${project.id}, 'My application', ${`app_${randomToken(12)}`}, 'Your first PayloadGrid application')`;
      await sql`insert into event_types (project_id, name, description) values (${project.id}, 'order.created', 'Example event type; rename or add your own') on conflict do nothing`;
    }
    if (requiresVerification) {
      const token = await createAuthToken(String(user.id), "verify_email", 24);
      const sent = await sendAuthEmail(email, "verify_email", token);
      return NextResponse.json({ ok: true, requiresVerification: true, emailSent: sent }, { status: 201 });
    }
    await createSession(String(user.id));
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email }, requiresVerification: false }, { status: 201 });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sign up failed" }, { status: 400 }); }
}