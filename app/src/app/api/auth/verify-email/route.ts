import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { sha256 } from "@/lib/security";
import { appUrl } from "@/lib/constants";
import { writeAccountAudit } from "@/lib/account-audit";

const schema = z.object({ token: z.string().trim().min(1) });

export async function GET(request: Request) {
  // Legacy links (sent before verification required an explicit confirm click)
  // pointed straight at this endpoint. Redirect to the confirm page instead of
  // consuming the token on a bare GET, since email-scanner link prefetching can
  // trigger a plain GET before the real recipient ever opens the message.
  const token = new URL(request.url).searchParams.get("token") || "";
  return NextResponse.redirect(`${appUrl()}/verify-email/confirm?token=${encodeURIComponent(token)}`);
}

export async function POST(request: Request) {
  try {
    const { token } = schema.parse(await request.json());
    const sql = requireSql();
    const [record] = await sql`select id, user_id from auth_tokens where kind = 'verify_email' and token_hash = ${sha256(token)} and used_at is null and expires_at > now() limit 1`;
    if (!record) return NextResponse.json({ ok: false, error: "This verification link is invalid, expired, or already used." }, { status: 400 });
    await sql`update users set email_verified_at = now(), updated_at = now() where id = ${record.user_id}`;
    await sql`update auth_tokens set used_at = now() where id = ${record.id}`;
    await writeAccountAudit(String(record.user_id), "account.email_verified");
    await createSession(String(record.user_id), request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: "A verification token is required" }, { status: 400 });
    return NextResponse.json({ ok: false, error: "Could not verify the email" }, { status: 500 });
  }
}
