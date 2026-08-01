import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSql } from "@/lib/db";
import { hashPassword, sha256 } from "@/lib/security";
const schema = z.object({ token: z.string().min(20), password: z.string().min(10).max(128) });
export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json()); const sql = requireSql();
    const [record] = await sql`select id, user_id from auth_tokens where kind = 'reset_password' and token_hash = ${sha256(body.token)} and used_at is null and expires_at > now() limit 1`;
    if (!record) return NextResponse.json({ ok: false, error: "This reset link is invalid or expired" }, { status: 400 });
    const passwordHash = await hashPassword(body.password);
    await sql`update users set password_hash = ${passwordHash}, updated_at = now() where id = ${record.user_id}`;
    await sql`update auth_tokens set used_at = now() where id = ${record.id}`;
    await sql`delete from sessions where user_id = ${record.user_id}`;
    return NextResponse.json({ ok: true });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Password reset failed" }, { status: 400 }); }
}