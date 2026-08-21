import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAccountAudit } from "@/lib/account-audit";
import { authErrorResponse, destroySession, requireSession, SESSION_COOKIE } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { sha256 } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const removeSchema = z.object({ sessionId: z.string().uuid().optional(), scope: z.enum(["others", "all"]).optional() }).refine((value) => Boolean(value.sessionId || value.scope), "Choose a session or scope");

export async function GET() {
  try {
    const context = await requireSession();
    const token = (await cookies()).get(SESSION_COOKIE)?.value || "";
    const sql = requireSql();
    const sessions = await sql`
      select id, created_at, last_seen_at, expires_at, user_agent, ip_address,
        (token_hash = ${sha256(token)}) as is_current
      from sessions where user_id = ${context.user.id} and expires_at > now()
      order by is_current desc, last_seen_at desc
    `;
    const history = await sql`
      select id, action, metadata, created_at from account_audit_logs
      where user_id = ${context.user.id}
      order by created_at desc limit 30
    `;
    return NextResponse.json({ ok: true, sessions, history }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const response = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: response.message }, { status: response.status });
  }
}

export async function DELETE(request: Request) {
  try {
    const context = await requireSession();
    const body = removeSchema.parse(await request.json());
    const token = (await cookies()).get(SESSION_COOKIE)?.value || "";
    const currentHash = sha256(token);
    const sql = requireSql();
    let removed = 0;
    let action = "account.session_revoked";

    if (body.sessionId) {
      const rows = await sql`delete from sessions where id = ${body.sessionId} and user_id = ${context.user.id} and token_hash <> ${currentHash} returning id`;
      removed = rows.length;
      if (!removed) return NextResponse.json({ ok: false, error: "That session is current, missing, or already revoked" }, { status: 400 });
    } else if (body.scope === "others") {
      const rows = await sql`delete from sessions where user_id = ${context.user.id} and token_hash <> ${currentHash} returning id`;
      removed = rows.length; action = "account.other_sessions_revoked";
    } else {
      const rows = await sql`delete from sessions where user_id = ${context.user.id} returning id`;
      removed = rows.length; action = "account.all_sessions_revoked";
    }
    await writeAccountAudit(context.user.id, action, { removed });
    if (body.scope === "all") await destroySession();
    return NextResponse.json({ ok: true, removed, signedOut: body.scope === "all" });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: error.issues[0]?.message || "Invalid session request" }, { status: 400 });
    const response = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: response.message }, { status: response.status });
  }
}
