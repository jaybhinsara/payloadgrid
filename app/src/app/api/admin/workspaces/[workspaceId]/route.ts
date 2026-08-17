import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/operator";
import { writePlatformAudit } from "@/lib/platform-audit";

const schema = z.object({
  plan: z.enum(["free", "starter", "growth", "enterprise"]).optional(),
  name: z.string().trim().min(2).max(80).optional()
}).refine((value) => value.plan !== undefined || value.name !== undefined, "No workspace changes supplied");
const deleteSchema = z.object({ confirmation: z.string() });
type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const body = schema.parse(await request.json());
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const sql = requireSql();
    const [current] = await sql`select id, name, slug, plan from organizations where id=${workspaceId} limit 1`;
    if (!current) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    const nextPlan = body.plan ?? String(current.plan);
    const nextName = body.name ?? String(current.name);
    const [workspace] = await sql`update organizations set plan=${nextPlan}, name=${nextName}, updated_at=now() where id=${workspaceId} returning id, name, slug, plan, updated_at`;
    await writePlatformAudit(context.user.id, "workspace.updated", "organization", workspaceId, {
      previousName: current.name, name: nextName, previousPlan: current.plan, plan: nextPlan
    });
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const body = deleteSchema.parse(await request.json());
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const sql = requireSql();
    const [workspace] = await sql`
      select o.id, o.name, o.slug, o.plan, subscription.status as billing_status
      from organizations o left join billing_subscriptions subscription on subscription.organization_id=o.id
      where o.id=${workspaceId} limit 1
    `;
    if (!workspace) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    if (body.confirmation !== workspace.name) return NextResponse.json({ ok: false, error: "Workspace name confirmation did not match" }, { status: 400 });
    if (["trialing", "active", "past_due"].includes(String(workspace.billing_status || ""))) {
      return NextResponse.json({ ok: false, error: "Cancel the active subscription before deleting this workspace" }, { status: 409 });
    }
    await writePlatformAudit(context.user.id, "workspace.deleted", "organization", workspaceId, {
      name: workspace.name, slug: workspace.slug, plan: workspace.plan
    });
    await sql`delete from organizations where id=${workspaceId}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}
