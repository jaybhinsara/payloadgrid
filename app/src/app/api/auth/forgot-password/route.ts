import { NextResponse } from "next/server";
import { z } from "zod";
import { appUrl } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { createAuthToken, PASSWORD_RESET_HOURS, sendAuthEmail } from "@/lib/email";
import { authRateLimitResponse, enforceAuthRateLimit } from "@/lib/auth-rate-limit";
const schema = z.object({ email: z.string().trim().email() });
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json()); const sql = requireSql();
    await enforceAuthRateLimit(request, "password-reset-ip", { limit: 10, windowSeconds: 3600 });
    await enforceAuthRateLimit(request, "password-reset-email", { identifier: body.email, limit: 3, windowSeconds: 3600 });
    const [user] = await sql`select id, email from users where email = ${body.email.toLowerCase()} limit 1`;
    let debugResetUrl: string | undefined;
    if (user) {
      const token = await createAuthToken(String(user.id), "reset_password", PASSWORD_RESET_HOURS); await sendAuthEmail(String(user.email), "reset_password", token);
      if (process.env.NODE_ENV !== "production") debugResetUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(token)}`;
    }
    return NextResponse.json({ ok: true, message: "If the address exists, a reset link has been sent.", debugResetUrl });
  } catch (error) {
    const limited = authRateLimitResponse(error);
    if (limited) return NextResponse.json(limited.body, { status: limited.status, headers: limited.headers });
    return NextResponse.json({ ok: true, message: "If the address exists, a reset link has been sent." });
  }
}
