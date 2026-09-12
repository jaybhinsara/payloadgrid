import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { createAuthToken, EMAIL_VERIFICATION_HOURS, sendAuthEmail } from "@/lib/email";
import { requireSql } from "@/lib/db";
import { verifyPassword } from "@/lib/security";
import { writeAccountAudit } from "@/lib/account-audit";
import { authRateLimitResponse, enforceAuthRateLimit } from "@/lib/auth-rate-limit";
export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  try {
    const sql = requireSql(); const body = schema.parse(await request.json());
    await enforceAuthRateLimit(request, "login-ip", { limit: 30, windowSeconds: 900 });
    await enforceAuthRateLimit(request, "login-email", { identifier: body.email, limit: 10, windowSeconds: 900 });
    const [user] = await sql`select id, email, password_hash, email_verified_at, verification_required, suspended_at from users where email = ${body.email.toLowerCase()} limit 1`;
    if (!user || !user.password_hash || !(await verifyPassword(body.password, String(user.password_hash)))) {
      if (user) await writeAccountAudit(String(user.id), "account.login_failed", { reason: "incorrect_password" });
      return NextResponse.json({ ok: false, error: "Email or password is incorrect" }, { status: 401 });
    }
    if (user.suspended_at) {
      await writeAccountAudit(String(user.id), "account.login_failed", { reason: "account_suspended" });
      return NextResponse.json({ ok: false, error: "This account is suspended. Contact PayloadGrid support." }, { status: 403 });
    }
    if (user.verification_required && !user.email_verified_at) {
      const [recent] = await sql`select 1 from auth_tokens where user_id = ${user.id} and kind = 'verify_email' and created_at > now() - interval '60 seconds' limit 1`;
      if (!recent) { const token = await createAuthToken(String(user.id), "verify_email", EMAIL_VERIFICATION_HOURS); await sendAuthEmail(String(user.email), "verify_email", token); }
      return NextResponse.json({ ok: false, code: "EMAIL_VERIFICATION_REQUIRED", error: recent ? "Verify your email before signing in. A verification link was sent recently." : "Verify your email before signing in. We sent a new verification link." }, { status: 403 });
    }
    await createSession(String(user.id), request);
    await writeAccountAudit(String(user.id), "account.login_succeeded");
    return NextResponse.json({ ok: true });
  } catch (error) {
    const limited = authRateLimitResponse(error);
    if (limited) return NextResponse.json(limited.body, { status: limited.status, headers: limited.headers });
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sign in failed" }, { status: 400 });
  }
}
