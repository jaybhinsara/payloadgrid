import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAccountAudit } from "@/lib/account-audit";
import { authRateLimitResponse, enforceAuthRateLimit } from "@/lib/auth-rate-limit";
import { requireSql } from "@/lib/db";
import { createAuthToken, EMAIL_VERIFICATION_HOURS, emailDeliveryConfigured, sendAuthEmail } from "@/lib/email";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().email() });
const genericMessage = "If this address belongs to an unverified account, a new verification link has been sent.";

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const email = body.email.toLowerCase();
    await enforceAuthRateLimit(request, "verification-resend-ip", { limit: 10, windowSeconds: 3600 });
    await enforceAuthRateLimit(request, "verification-resend-email", { identifier: email, limit: 3, windowSeconds: 3600 });
    if (!emailDeliveryConfigured()) return NextResponse.json({ ok: false, error: "Email verification is temporarily unavailable" }, { status: 503 });

    const sql = requireSql();
    const [user] = await sql`
      select id, email from users
      where email = ${email} and verification_required = true and email_verified_at is null
      limit 1
    `;
    if (user) {
      const [recent] = await sql`
        select id from auth_tokens
        where user_id = ${user.id} and kind = 'verify_email' and created_at > now() - interval '1 minute'
        limit 1
      `;
      if (!recent) {
        const token = await createAuthToken(String(user.id), "verify_email", EMAIL_VERIFICATION_HOURS);
        const sent = await sendAuthEmail(String(user.email), "verify_email", token);
        if (sent) await writeAccountAudit(String(user.id), "account.verification_email_sent");
      }
    }
    return NextResponse.json({ ok: true, message: genericMessage });
  } catch (error) {
    const limited = authRateLimitResponse(error);
    if (limited) return NextResponse.json(limited.body, { status: limited.status, headers: limited.headers });
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "Enter a valid email address" }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Could not send a verification email" }, { status: 500 });
  }
}
