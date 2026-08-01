import { NextResponse } from "next/server";
import { createSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { sha256 } from "@/lib/security";
import { appUrl } from "@/lib/constants";
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return NextResponse.redirect(`${appUrl()}/login?error=missing-verification-token`);
  const sql = requireSql();
  const [record] = await sql`select id, user_id from auth_tokens where kind = 'verify_email' and token_hash = ${sha256(token)} and used_at is null and expires_at > now() limit 1`;
  if (!record) return NextResponse.redirect(`${appUrl()}/login?error=invalid-verification-link`);
  await sql`update users set email_verified_at = now(), updated_at = now() where id = ${record.user_id}`;
  await sql`update auth_tokens set used_at = now() where id = ${record.id}`;
  await createSession(String(record.user_id));
  return NextResponse.redirect(`${appUrl()}/dashboard`);
}