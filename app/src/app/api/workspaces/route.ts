import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession, setActiveOrganization, setActiveProject } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { randomToken, slugify } from "@/lib/security";

const schema = z.object({ name: z.string().trim().min(2).max(100) });
export async function POST(request: Request) {
  try {
    const context = await requireSession();
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const suffix = slugify(randomToken(5)).slice(0, 8);
    const organizationSlug = `${slugify(body.name)}-${suffix}`;
    const projectSlug = `${organizationSlug}-production`;
    const [created] = await sql`
      with new_organization as (
        insert into organizations (name, slug) values (${body.name}, ${organizationSlug}) returning id, name, slug
      ), new_membership as (
        insert into organization_members (organization_id, user_id, role)
        select id, ${context.user.id}, 'owner' from new_organization
      ), new_project as (
        insert into projects (organization_id, name, slug, environment)
        select id, 'Production', ${projectSlug}, 'production' from new_organization returning id, name, slug, environment
      ), new_application as (
        insert into applications (project_id, name, uid, description)
        select id, 'My application', ${`app_${randomToken(12)}`}, 'Your first PayloadGrid application' from new_project
      ), new_event_type as (
        insert into event_types (project_id, name, description)
        select id, 'order.created', 'Example event type; rename or add your own' from new_project
      )
      select o.id, o.name, o.slug, p.id as project_id, p.name as project_name, p.environment
      from new_organization o cross join new_project p
    `;
    await writeAudit(String(created.id), context.user.id, "workspace.created", "organization", String(created.id));
    await setActiveOrganization(String(created.id));
    await setActiveProject(String(created.project_id));
    return NextResponse.json({ ok: true, organization: created }, { status: 201 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}