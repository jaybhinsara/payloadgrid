import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession, setActiveOrganization } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("rename"), name: z.string().trim().min(2).max(100) }),
  z.object({ action: z.literal("transfer"), userId: z.string().uuid() })
]);
type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    const { workspaceId } = await contextValue.params;
    if (workspaceId !== context.organization.id) return NextResponse.json({ ok: false, error: "Switch to this workspace before managing it" }, { status: 403 });
    const body = schema.parse(await request.json());
    const sql = requireSql();
    if (body.action === "rename") {
      requireRole(context, ["owner", "admin"]);
      const [organization] = await sql`update organizations set name = ${body.name}, updated_at = now() where id = ${workspaceId} returning id, name, slug, plan`;
      await writeAudit(workspaceId, context.user.id, "workspace.renamed", "organization", workspaceId);
      return NextResponse.json({ ok: true, organization });
    }
    requireRole(context, ["owner"]);
    if (body.userId === context.user.id) return NextResponse.json({ ok: false, error: "Select another member to transfer ownership" }, { status: 400 });
    const [target] = await sql`select user_id, role from organization_members where organization_id = ${workspaceId} and user_id = ${body.userId} limit 1`;
    if (!target) return NextResponse.json({ ok: false, error: "The new owner must already be a workspace member" }, { status: 404 });
    await sql`
      with demoted_owner as (
        update organization_members set role = 'admin' where organization_id = ${workspaceId} and user_id = ${context.user.id}
      )
      update organization_members set role = 'owner' where organization_id = ${workspaceId} and user_id = ${body.userId}
    `;
    await writeAudit(workspaceId, context.user.id, "workspace.ownership_transferred", "organization", workspaceId, { newOwnerId: body.userId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    const { workspaceId } = await contextValue.params;
    if (workspaceId !== context.organization.id) return NextResponse.json({ ok: false, error: "Switch to this workspace before managing it" }, { status: 403 });
    const mode = new URL(request.url).searchParams.get("mode") === "delete" ? "delete" : "leave";
    const sql = requireSql();
    const remaining = await sql`
      select o.id from organization_members om join organizations o on o.id = om.organization_id
      where om.user_id = ${context.user.id} and o.id <> ${workspaceId} order by om.created_at asc limit 1
    `;
    if (!remaining.length) return NextResponse.json({ ok: false, error: "Create or join another workspace before leaving your only workspace" }, { status: 409 });
    if (mode === "delete") {
      requireRole(context, ["owner"]);
      await sql`delete from organizations where id = ${workspaceId}`;
    } else {
      if (context.organization.role === "owner") return NextResponse.json({ ok: false, error: "Transfer ownership before leaving this workspace" }, { status: 409 });
      await sql`delete from organization_members where organization_id = ${workspaceId} and user_id = ${context.user.id}`;
    }
    await setActiveOrganization(String(remaining[0].id));
    return NextResponse.json({ ok: true, nextOrganizationId: remaining[0].id });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}