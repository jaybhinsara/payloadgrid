import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/operator";
import { writePlatformAudit } from "@/lib/platform-audit";

const schema = z.object({ plan: z.enum(["free", "starter", "growth", "enterprise"]) });
type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const body = schema.parse(await request.json());
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const sql = requireSql();
    const [current] = await sql`select id, name, plan from organizations where id=${workspaceId} limit 1`;
    if (!current) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    const [workspace] = await sql`update organizations set plan=${body.plan}, updated_at=now() where id=${workspaceId} returning id, name, slug, plan, updated_at`;
    await writePlatformAudit(context.user.id, "workspace.plan_changed", "organization", workspaceId, { previousPlan: current.plan, plan: body.plan });
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}
