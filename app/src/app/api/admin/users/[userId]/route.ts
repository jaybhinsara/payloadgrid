import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { isPlatformAdmin, requirePlatformAdmin } from "@/lib/operator";
import { writePlatformAudit } from "@/lib/platform-audit";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  verified: z.boolean()
});
const deleteSchema = z.object({ confirmation: z.string() });
type RouteContext = { params: Promise<{ userId: string }> };

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const body = updateSchema.parse(await request.json());
    const userId = z.string().uuid().parse((await contextValue.params).userId);
    const sql = requireSql();
    const [current] = await sql`select id, name, email, email_verified_at from users where id=${userId} limit 1`;
    if (!current) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    if (isPlatformAdmin(String(current.email)) && userId !== context.user.id) {
      return NextResponse.json({ ok: false, error: "Another platform admin account cannot be modified here" }, { status: 403 });
    }
    if (userId === context.user.id && body.email !== context.user.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: "Change your own admin email through account security settings" }, { status: 409 });
    }
    const verifiedAt = body.verified ? (current.email_verified_at || new Date().toISOString()) : null;
    const [user] = await sql`
      update users set name=${body.name}, email=${body.email}, email_verified_at=${verifiedAt},
        verification_required=${!body.verified}, updated_at=now()
      where id=${userId} returning id, name, email, email_verified_at, verification_required, updated_at
    `;
    await writePlatformAudit(context.user.id, "user.updated", "user", userId, {
      previousName: current.name, name: body.name, previousEmail: current.email, email: body.email, verified: body.verified
    });
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const result = authErrorResponse(error);
    const message = error instanceof Error && /unique/i.test(error.message) ? "That email address is already in use" : result.message;
    return NextResponse.json({ ok: false, error: message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const body = deleteSchema.parse(await request.json());
    const userId = z.string().uuid().parse((await contextValue.params).userId);
    if (userId === context.user.id) return NextResponse.json({ ok: false, error: "You cannot delete your current admin account" }, { status: 409 });
    const sql = requireSql();
    const [user] = await sql`
      select u.id, u.name, u.email,
        count(*) filter (where om.role='owner')::int as owned_workspaces
      from users u left join organization_members om on om.user_id=u.id
      where u.id=${userId} group by u.id limit 1
    `;
    if (!user) return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    if (isPlatformAdmin(String(user.email))) return NextResponse.json({ ok: false, error: "Platform admin accounts cannot be deleted here" }, { status: 403 });
    if (body.confirmation !== user.email) return NextResponse.json({ ok: false, error: "Email confirmation did not match" }, { status: 400 });
    if (Number(user.owned_workspaces) > 0) {
      return NextResponse.json({ ok: false, error: "Transfer or delete this user's owned workspaces first" }, { status: 409 });
    }
    await writePlatformAudit(context.user.id, "user.deleted", "user", userId, { name: user.name, email: user.email });
    await sql`delete from users where id=${userId}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}
