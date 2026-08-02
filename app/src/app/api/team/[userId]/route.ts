import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";

const updateSchema = z.object({ role: z.enum(["admin", "developer", "viewer"]) });
type RouteContext = { params: Promise<{ userId: string }> };

async function getManagedMember(organizationId: string, userId: string) {
  const sql = requireSql();
  const [member] = await sql`
    select user_id, role from organization_members
    where organization_id = ${organizationId} and user_id = ${userId} limit 1
  `;
  return member;
}

function managementError(actorRole: string, actorId: string, target: Record<string, unknown> | undefined, requestedRole?: string) {
  if (!target) return "Member not found";
  if (String(target.role) === "owner") return "The workspace owner cannot be modified or removed";
  if (String(target.user_id) === actorId) return "You cannot change or remove your own membership";
  if (actorRole === "admin" && (String(target.role) === "admin" || requestedRole === "admin")) return "Only the workspace owner can manage administrators";
  return "";
}

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const { userId } = await contextValue.params;
    const body = updateSchema.parse(await request.json());
    const target = await getManagedMember(context.organization.id, userId);
    const error = managementError(context.organization.role, context.user.id, target, body.role);
    if (error) return NextResponse.json({ ok: false, error }, { status: target ? 403 : 404 });
    const sql = requireSql();
    const [member] = await sql`
      update organization_members set role = ${body.role}
      where organization_id = ${context.organization.id} and user_id = ${userId}
      returning user_id, role
    `;
    await writeAudit(context.organization.id, context.user.id, "member.role_updated", "user", userId, { previousRole: target.role, role: body.role });
    return NextResponse.json({ ok: true, member });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const { userId } = await contextValue.params;
    const target = await getManagedMember(context.organization.id, userId);
    const error = managementError(context.organization.role, context.user.id, target);
    if (error) return NextResponse.json({ ok: false, error }, { status: target ? 403 : 404 });
    const sql = requireSql();
    const [removed] = await sql`
      delete from organization_members
      where organization_id = ${context.organization.id} and user_id = ${userId}
      returning user_id
    `;
    if (!removed) return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    await writeAudit(context.organization.id, context.user.id, "member.removed", "user", userId, { previousRole: target.role });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}