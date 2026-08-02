import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession, setActiveProject } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";

const schema = z.object({ name: z.string().trim().min(2).max(80), environment: z.enum(["development", "staging", "production"]) });
type RouteContext = { params: Promise<{ projectId: string }> };

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const { projectId } = await contextValue.params;
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const [project] = await sql`
      update projects set name = ${body.name}, environment = ${body.environment}, updated_at = now()
      where id = ${projectId} and organization_id = ${context.organization.id}
      returning id, name, slug, environment, created_at
    `;
    if (!project) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    await writeAudit(context.organization.id, context.user.id, "project.updated", "project", projectId, { environment: body.environment });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const { projectId } = await contextValue.params;
    const sql = requireSql();
    const projects = await sql`select id from projects where organization_id = ${context.organization.id} order by created_at asc`;
    if (!projects.some((project) => String(project.id) === projectId)) return NextResponse.json({ ok: false, error: "Project not found" }, { status: 404 });
    if (projects.length <= 1) return NextResponse.json({ ok: false, error: "A workspace must keep at least one project" }, { status: 409 });
    const nextProject = projects.find((project) => String(project.id) !== projectId);
    await writeAudit(context.organization.id, context.user.id, "project.deleted", "project", projectId);
    await sql`delete from projects where id = ${projectId} and organization_id = ${context.organization.id}`;
    if (context.project.id === projectId && nextProject) await setActiveProject(String(nextProject.id));
    return NextResponse.json({ ok: true, nextProjectId: nextProject?.id });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}