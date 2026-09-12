import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession, setActiveOrganization } from "@/lib/auth";
import { requireSql } from "@/lib/db";
const schema = z.object({ organizationId: z.string().uuid() });
export async function POST(request: Request) {
  try { const context = await requireSession(); const body = schema.parse(await request.json()); const sql = requireSql(); const [membership] = await sql`select 1 from organization_members where organization_id = ${body.organizationId} and user_id = ${context.user.id} limit 1`; if (!membership) return NextResponse.json({ ok: false, error: "Organization membership not found" }, { status: 403 }); await setActiveOrganization(body.organizationId); return NextResponse.json({ ok: true }); }
  catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ ok: false, error: error.issues[0]?.message || "Invalid request." }, { status: 400 });
    const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}