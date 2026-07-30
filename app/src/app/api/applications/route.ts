import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { randomToken } from "@/lib/security";

const schema = z.object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(240).optional() });
export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const body = schema.parse(await request.json()); const sql = requireSql();
    const [application] = await sql`insert into applications (project_id, name, uid, description) values (${context.project.id}, ${body.name}, ${`app_${randomToken(12)}`}, ${body.description || null}) returning id, name, uid, description, created_at`;
    await writeAudit(context.organization.id, context.user.id, "application.created", "application", String(application.id));
    return NextResponse.json({ ok: true, application }, { status: 201 });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status }); }
}