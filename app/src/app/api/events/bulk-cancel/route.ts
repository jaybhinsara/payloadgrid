import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { updateMessageStatus } from "@/lib/delivery-worker";

export const runtime = "nodejs";

const filterSchema = z.object({
  status: z.enum(["queued", "received", "retrying"]),
  direction: z.enum(["inbound", "outbound"]).optional(),
  endpointId: z.string().uuid().optional(),
  eventType: z.string().trim().max(120).optional(),
  payloadPath: z.string().trim().regex(/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+){0,9}$/).optional(),
  payloadValue: z.string().trim().max(300).optional(),
  headerName: z.string().trim().regex(/^[a-zA-Z0-9-]{1,80}$/).optional(),
  headerValue: z.string().trim().max(300).optional()
});
const schema = z.object({
  eventIds: z.array(z.string().uuid()).min(1).max(500).optional(),
  filters: filterSchema.optional(),
  maxEvents: z.number().int().min(1).max(5000).default(5000)
}).refine((value) => value.eventIds?.length || value.filters, "Provide event IDs or cancellation filters");

export async function POST(request: Request) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const body = schema.parse(await request.json());
    const params: unknown[] = [context.project.id];
    const clauses = ["ep.project_id = $1", "e.status in ('queued','received','retrying')"];
    const add = (value: unknown, clause: (index: number) => string) => { params.push(value); clauses.push(clause(params.length)); };
    if (body.eventIds) add([...new Set(body.eventIds)], (index) => `e.id = any($${index}::uuid[])`);
    if (body.filters?.status) add(body.filters.status, (index) => `e.status = $${index}`);
    if (body.filters?.direction) add(body.filters.direction, (index) => `e.direction = $${index}`);
    if (body.filters?.endpointId) add(body.filters.endpointId, (index) => `e.endpoint_id = $${index}::uuid`);
    if (body.filters?.eventType) add(body.filters.eventType, (index) => `e.event_type = $${index}`);
    if (body.filters?.payloadPath) {
      add(body.filters.payloadPath.split("."), (index) => body.filters?.payloadValue ? `e.request_body #>> $${index}::text[] = $${index + 1}` : `e.request_body #> $${index}::text[] is not null`);
      if (body.filters.payloadValue) params.push(body.filters.payloadValue);
    }
    if (body.filters?.headerName) {
      add(body.filters.headerName, (index) => body.filters?.headerValue ? `coalesce(e.request_headers ->> lower($${index}), e.request_headers ->> $${index}) = $${index + 1}` : `(e.request_headers ? lower($${index}) or e.request_headers ? $${index})`);
      if (body.filters.headerValue) params.push(body.filters.headerValue);
    }
    params.push(body.maxEvents);
    const sql = requireSql();
    const cancelled = await sql.query(`
      with targets as (
        select e.id from webhook_events e join endpoints ep on ep.id = e.endpoint_id
        where ${clauses.join(" and ")}
        order by e.received_at asc limit $${params.length}
        for update of e skip locked
      )
      update webhook_events e set status='cancelled', cancelled_at=now(), dead_lettered_at=null,
        next_retry_at=null, locked_at=null, revenue_at_risk=0, last_error='Cancelled by user', updated_at=now()
      from targets t where e.id=t.id
      returning e.id, e.message_id
    `, params) as Array<{ id: string; message_id: string | null }>;
    if (!cancelled.length) return NextResponse.json({ ok: false, error: "No queued or retrying deliveries matched" }, { status: 404 });
    const eventIds = cancelled.map((event) => event.id);
    await sql`update dispatch_jobs set status='cancelled', last_error='Delivery cancelled by user', locked_at=null, updated_at=now() where event_id=any(${eventIds}::uuid[]) and status in ('pending','publishing','published')`;
    const messageIds = [...new Set(cancelled.map((event) => event.message_id).filter((value): value is string => Boolean(value)))];
    await Promise.all(messageIds.map(updateMessageStatus));
    await writeAudit(context.organization.id, context.user.id, "event.bulk_cancelled", "event", undefined, { count: cancelled.length, filters: body.filters || null });
    return NextResponse.json({ ok: true, cancelled: cancelled.length, limitReached: cancelled.length === body.maxEvents });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
