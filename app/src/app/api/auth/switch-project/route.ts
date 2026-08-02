import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession, setActiveProject } from "@/lib/auth";
import { requireSql } from "@/lib/db";

const schema = z.object({ projectId: z.string().uuid() });
export async function POST(request: Request) {
  try {
    const context = await requireSession();
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const [project] = await sql`select id from projects where id = ${body.projectId} and organization_id = ${context.organization.id} limit 1`;
    if (!project) return NextResponse.json({ ok: false, error: "Project not found in this workspace" }, { status: 403 });
    await setActiveProject(body.projectId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}