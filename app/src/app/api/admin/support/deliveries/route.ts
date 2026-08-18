import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  search: z.string().trim().max(160).optional(),
  workspaceId: z.string().uuid().optional(),
  status: z.enum(["queued", "buffered", "processing", "received", "delivered", "failed", "retrying", "cancelled", "dead_letter", "resolved", "archived"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export async function GET(request: Request) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const params: unknown[] = [];
    const clauses = ["e.is_simulation = false"];
    const add = (clause: (index: number) => string, value: unknown) => { params.push(value); clauses.push(clause(params.length)); };
    if (input.workspaceId) add((index) => `o.id = $${index}::uuid`, input.workspaceId);
    if (input.status === "archived") clauses.push("e.support_archived_at is not null");
    else clauses.push("e.support_archived_at is null");
    if (input.status === "resolved") clauses.push("e.status = 'dead_letter' and e.resolved_at is not null");
    else if (input.status === "dead_letter") clauses.push("e.status = 'dead_letter' and e.resolved_at is null");
    else if (input.status) add((index) => `e.status = $${index}`, input.status);
    if (input.search) add((index) => `position(lower($${index}) in lower(concat_ws(' ', e.id::text, coalesce(e.provider_event_id, ''), coalesce(e.message_id::text, ''), e.event_type, ep.name, p.name, o.name, o.slug))) > 0`, input.search);
    params.push(input.limit);
    const sql = requireSql();
    const deliveries = await sql.query(`
      select e.id, e.message_id, e.provider_event_id, e.event_type, e.direction,
        case when e.support_archived_at is not null then 'archived' when e.status='dead_letter' and e.resolved_at is not null then 'resolved' else e.status end as status,
        e.retry_count, e.max_retries, e.next_retry_at, e.last_error, e.received_at, e.updated_at,
        ep.id as endpoint_id, ep.name as endpoint_name, p.id as project_id, p.name as project_name,
        o.id as workspace_id, o.name as workspace_name,
        coalesce(attempts.total, 0)::int as attempt_count, attempts.response_status, attempts.latency_ms,
        jobs.status as job_status, jobs.available_at, jobs.publish_attempts, jobs.last_error as job_error
      from webhook_events e
      join endpoints ep on ep.id=e.endpoint_id
      join projects p on p.id=ep.project_id
      join organizations o on o.id=p.organization_id
      left join dispatch_jobs jobs on jobs.event_id=e.id
      left join lateral (
        select (select count(*)::int from delivery_attempts counted where counted.event_id=e.id) as total,
          a.response_status, a.latency_ms
        from delivery_attempts a where a.event_id=e.id order by a.created_at desc limit 1
      ) attempts on true
      where ${clauses.join(" and ")}
      order by e.received_at desc, e.id desc
      limit $${params.length}
    `, params);
    return NextResponse.json({ ok: true, deliveries }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
