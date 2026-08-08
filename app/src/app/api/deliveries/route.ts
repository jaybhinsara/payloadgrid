import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const statusValues = ["queued", "processing", "received", "delivered", "failed", "retrying", "cancelled", "dead_letter", "resolved"] as const;
const querySchema = z.object({
  search: z.string().trim().max(120).optional(),
  status: z.enum(statusValues).optional(),
  direction: z.enum(["inbound", "outbound"]).optional(),
  endpointId: z.string().uuid().optional(),
  cursor: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});
const cursorSchema = z.object({ receivedAt: z.string().datetime(), id: z.string().uuid() });

function decodeCursor(value?: string) {
  if (!value) return null;
  try { return cursorSchema.parse(JSON.parse(Buffer.from(value, "base64url").toString("utf8"))); }
  catch { throw new Error("Invalid delivery cursor"); }
}

function encodeCursor(row: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({ receivedAt: new Date(String(row.received_at)).toISOString(), id: String(row.id) })).toString("base64url");
}

export async function GET(request: Request) {
  try {
    const context = await requireSession();
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const cursor = decodeCursor(input.cursor);
    const params: unknown[] = [context.project.id];
    const clauses = ["ep.project_id = $1"];
    const add = (clause: (index: number) => string, value: unknown) => { params.push(value); clauses.push(clause(params.length)); };
    if (input.search) add((index) => `position(lower($${index}) in lower(concat_ws(' ', e.event_type, coalesce(e.provider_event_id, ''), e.id::text, ep.name))) > 0`, input.search);
    if (input.status === "resolved") clauses.push("e.status = 'dead_letter' and e.resolved_at is not null");
    else if (input.status === "dead_letter") clauses.push("e.status = 'dead_letter' and e.resolved_at is null");
    else if (input.status) add((index) => `e.status = $${index}`, input.status);
    if (input.direction) add((index) => `e.direction = $${index}`, input.direction);
    if (input.endpointId) add((index) => `e.endpoint_id = $${index}::uuid`, input.endpointId);
    if (cursor) {
      params.push(cursor.receivedAt, cursor.id);
      clauses.push(`(e.received_at, e.id) < ($${params.length - 1}::timestamptz, $${params.length}::uuid)`);
    }
    params.push(input.limit + 1);
    const sql = requireSql();
    const rows = await sql.query(`
      select e.id, e.endpoint_id, ep.name as endpoint_name, e.application_id, e.message_id, e.direction, e.provider,
        e.provider_event_id, e.event_type, case when e.status = 'dead_letter' and e.resolved_at is not null then 'resolved' else e.status end as status, e.revenue_at_risk, e.revenue_currency, e.received_at,
        e.request_headers, e.request_body, e.retry_count, e.max_retries, e.next_retry_at, e.last_error,
        e.cancelled_at, e.dead_lettered_at, e.resolved_at, e.resolution_note, resolver.name as resolved_by_name,
        coalesce(a.attempt_count, 0) as attempt_count,
        a.response_body, a.response_status, a.latency_ms, a.error
      from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      left join users resolver on resolver.id = e.resolved_by
      left join lateral (
        select latest.response_status, latest.response_body, latest.latency_ms, latest.error,
          (select count(*)::int from delivery_attempts counted where counted.event_id = e.id) as attempt_count
        from delivery_attempts latest where latest.event_id = e.id order by latest.created_at desc limit 1
      ) a on true
      where ${clauses.join(" and ")}
      order by e.received_at desc, e.id desc
      limit $${params.length}
    `, params);
    const hasMore = rows.length > input.limit;
    const events = rows.slice(0, input.limit) as Array<Record<string, unknown>>;
    return NextResponse.json({ ok: true, events, hasMore, nextCursor: hasMore ? encodeCursor(events[events.length - 1]) : null });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError || (error instanceof Error && error.message === "Invalid delivery cursor") ? 400 : result.status });
  }
}
