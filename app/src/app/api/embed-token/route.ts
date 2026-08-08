import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { appUrl } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { createEmbedToken } from "@/lib/embed";

const schema = z.object({ applicationId: z.string().uuid(), expiresInMinutes: z.number().int().min(5).max(60).default(30) });

export async function POST(request: Request) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const [application] = await sql`select id from applications where id = ${body.applicationId} and project_id = ${context.project.id} limit 1`;
    if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    const token = createEmbedToken({ projectId: context.project.id, applicationId: body.applicationId, exp: Math.floor(Date.now() / 1000) + body.expiresInMinutes * 60 });
    return NextResponse.json({ ok: true, url: `${appUrl()}/embed/deliveries?token=${encodeURIComponent(token)}`, expiresInMinutes: body.expiresInMinutes });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
