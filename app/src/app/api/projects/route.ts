import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession, setActiveProject } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { randomToken, slugify } from "@/lib/security";

const schema = z.object({ name: z.string().trim().min(2).max(80), environment: z.enum(["development", "staging", "production"]) });
export async function POST(request: Request) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const slug = `${context.organization.slug}-${slugify(body.name)}-${slugify(randomToken(4)).slice(0, 7)}`;
    const [project] = await sql`
      insert into projects (organization_id, name, slug, environment)
      values (${context.organization.id}, ${body.name}, ${slug}, ${body.environment})
      returning id, name, slug, environment, created_at
    `;
    await writeAudit(context.organization.id, context.user.id, "project.created", "project", String(project.id), { environment: body.environment });
    await setActiveProject(String(project.id));
    return NextResponse.json({ ok: true, project }, { status: 201 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}