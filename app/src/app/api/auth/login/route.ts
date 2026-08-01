import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { createAuthToken, sendAuthEmail } from "@/lib/email";
import { requireSql } from "@/lib/db";
import { verifyPassword } from "@/lib/security";
export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });
export async function POST(request: Request) {
  try {
    const sql = requireSql(); const body = schema.parse(await request.json());
    const [user] = await sql`select id, email, password_hash, email_verified_at, verification_required from users where email = ${body.email.toLowerCase()} limit 1`;
    if (!user || !(await verifyPassword(body.password, String(user.password_hash)))) return NextResponse.json({ ok: false, error: "Email or password is incorrect" }, { status: 401 });
    if (user.verification_required && !user.email_verified_at) {
      const token = await createAuthToken(String(user.id), "verify_email", 24); await sendAuthEmail(String(user.email), "verify_email", token);
      return NextResponse.json({ ok: false, error: "Verify your email before signing in. We sent a new verification link." }, { status: 403 });
    }
    await createSession(String(user.id)); return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sign in failed" }, { status: 400 }); }
}