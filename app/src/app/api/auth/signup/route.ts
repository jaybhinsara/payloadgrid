import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { createAuthToken, EMAIL_VERIFICATION_HOURS, emailDeliveryConfigured, sendAuthEmail } from "@/lib/email";
import { requireSql } from "@/lib/db";
import { hashPassword, randomToken, sha256, slugify } from "@/lib/security";
import { authRateLimitResponse, enforceAuthRateLimit } from "@/lib/auth-rate-limit";

export const runtime = "nodejs";
const optionalUrl = z.union([z.literal(""), z.string().trim().url().max(300)]).optional();
const schema = z.object({
  name: z.string().trim().min(2).max(80), email: z.string().trim().email().max(200), password: z.string().min(10).max(128),
  accountType: z.enum(["individual", "company"]),
  organizationName: z.string().trim().min(2).max(100).optional(), legalName: z.string().trim().min(2).max(160).optional(),
  website: optionalUrl, countryCode: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use a two-letter country code"),
  acceptTerms: z.literal("on"), inviteToken: z.string().min(20).optional()
});

export async function POST(request: Request) {
  try {
    const sql = requireSql(); const body = schema.parse(await request.json()); const email = body.email.toLowerCase();
    await enforceAuthRateLimit(request, "signup-ip", { limit: 10, windowSeconds: 3600 });
    await enforceAuthRateLimit(request, "signup-email", { identifier: email, limit: 3, windowSeconds: 3600 });
    if (process.env.NODE_ENV === "production" && !emailDeliveryConfigured()) return NextResponse.json({ ok: false, error: "Email verification is temporarily unavailable" }, { status: 503 });
    const [existing] = await sql`select id from users where email = ${email} limit 1`;
    if (existing) return NextResponse.json({ ok: false, error: "An account with this email already exists. Sign in before joining the invited workspace." }, { status: 409 });
    const passwordHash = await hashPassword(body.password); const requiresVerification = emailDeliveryConfigured();
    let user: Record<string, unknown>;
    // Each branch below is a single statement chaining CTEs, so the user row and
    // its workspace/membership are created atomically in one round trip: previously
    // these were separate sequential inserts, and a failure partway through (e.g. a
    // transient DB error after the users insert) left the account stranded with no
    // organization/project and no way to retry, since the email is already taken.
    if (body.inviteToken) {
      const [invitation] = await sql`select id, organization_id, email, role from organization_invitations where token_hash = ${sha256(body.inviteToken)} and accepted_at is null and expires_at > now() limit 1`;
      if (!invitation || String(invitation.email).toLowerCase() !== email) return NextResponse.json({ ok: false, error: "This invitation is invalid, expired, or belongs to another email." }, { status: 400 });
      [user] = await sql`
        with new_user as (
          insert into users (name, email, password_hash, email_verified_at, verification_required, account_type, profile_completed_at, terms_accepted_at, privacy_accepted_at)
          values (${body.name}, ${email}, ${passwordHash}, ${requiresVerification ? null : new Date().toISOString()}, ${requiresVerification}, ${body.accountType}, now(), now(), now())
          returning id, name, email
        ), member as (
          insert into organization_members (organization_id, user_id, role)
          select ${invitation.organization_id}, id, ${invitation.role} from new_user
        ), invite as (
          update organization_invitations set accepted_at = now() where id = ${invitation.id}
        )
        select id, name, email from new_user
      `;
    } else {
      if (!body.organizationName) return NextResponse.json({ ok: false, error: "Workspace name is required" }, { status: 400 });
      if (body.accountType === "company" && !body.legalName) return NextResponse.json({ ok: false, error: "Registered company name is required" }, { status: 400 });
      const suffix = randomToken(5).toLowerCase(); const organizationSlug = `${slugify(body.organizationName)}-${suffix}`; const projectSlug = `${organizationSlug}-production`;
      const applicationUid = `app_${randomToken(12)}`;
      [user] = await sql`
        with new_user as (
          insert into users (name, email, password_hash, email_verified_at, verification_required, account_type, profile_completed_at, terms_accepted_at, privacy_accepted_at)
          values (${body.name}, ${email}, ${passwordHash}, ${requiresVerification ? null : new Date().toISOString()}, ${requiresVerification}, ${body.accountType}, now(), now(), now())
          returning id, name, email
        ), org as (
          insert into organizations (name, slug, customer_type, legal_name, website, country_code)
          values (${body.organizationName}, ${organizationSlug}, ${body.accountType}, ${body.legalName || null}, ${body.website || null}, ${body.countryCode})
          returning id
        ), member as (
          insert into organization_members (organization_id, user_id, role)
          select org.id, new_user.id, 'owner' from org, new_user
        ), project as (
          insert into projects (organization_id, name, slug, environment)
          select id, 'Production', ${projectSlug}, 'production' from org
          returning id
        ), application as (
          insert into applications (project_id, name, uid, description)
          select id, 'My application', ${applicationUid}, 'Your first PayloadGrid application' from project
        ), event_type as (
          insert into event_types (project_id, name, description)
          select id, 'order.created', 'Example event type; rename or add your own' from project
          on conflict do nothing
        )
        select id, name, email from new_user
      `;
    }
    if (requiresVerification) {
      const token = await createAuthToken(String(user.id), "verify_email", EMAIL_VERIFICATION_HOURS);
      const sent = await sendAuthEmail(email, "verify_email", token);
      return NextResponse.json({ ok: true, requiresVerification: true, emailSent: sent }, { status: 201 });
    }
    await createSession(String(user.id), request);
    return NextResponse.json({ ok: true, user: { id: user.id, name: user.name, email: user.email }, requiresVerification: false }, { status: 201 });
  } catch (error) {
    const limited = authRateLimitResponse(error);
    if (limited) return NextResponse.json(limited.body, { status: limited.status, headers: limited.headers });
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: error.issues[0]?.message || "Check your account details." }, { status: 400 });
    if ((error as { code?: string })?.code === "23505") return NextResponse.json({ ok: false, error: "An account with this email already exists. Sign in before joining the invited workspace." }, { status: 409 });
    console.error("Sign up failed", error);
    return NextResponse.json({ ok: false, error: "Could not create the account. Please try again." }, { status: 500 });
  }
}
