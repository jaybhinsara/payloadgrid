import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { verifyPassword } from "@/lib/security";

export const runtime = "nodejs";
const schema = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });

export async function POST(request: Request) {
  try {
    const sql = requireSql();
    const body = schema.parse(await request.json());
    const [user] = await sql`select id, password_hash from users where email = ${body.email.toLowerCase()} limit 1`;
    if (!user || !(await verifyPassword(body.password, String(user.password_hash)))) {
      return NextResponse.json({ ok: false, error: "Email or password is incorrect" }, { status: 401 });
    }
    await createSession(String(user.id));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Sign in failed" }, { status: 400 });
  }
}