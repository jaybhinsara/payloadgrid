import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().refine((value) => [25, 50, 75, 100].includes(value), "Invalid page size").default(25)
});

export async function GET(request: Request) {
  try {
    const context = await requireSession();
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const offset = (query.page - 1) * query.limit;
    const sql = requireSql();
    const [logs, countRows] = await Promise.all([
      sql`
        select l.id, l.action, l.resource_type, l.resource_id, l.metadata, l.created_at,
          u.name as actor_name, u.email as actor_email
        from audit_logs l left join users u on u.id = l.user_id
        where l.organization_id = ${context.organization.id}
        order by l.created_at desc, l.id desc
        limit ${query.limit} offset ${offset}
      `,
      sql`select count(*)::int as total from audit_logs where organization_id = ${context.organization.id}`
    ]);
    const total = Number(countRows[0]?.total || 0);
    return NextResponse.json({ ok: true, logs, pagination: { page: query.page, limit: query.limit, total, pages: Math.max(1, Math.ceil(total / query.limit)) } });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
