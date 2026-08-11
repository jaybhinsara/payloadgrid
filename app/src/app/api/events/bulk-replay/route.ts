import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { scheduleReplay, type ReplayTarget } from "@/lib/delivery-operations";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const filterSchema = z.object({
  status: z.enum(["delivered", "failed", "dead_letter", "cancelled"]).optional(), direction: z.enum(["inbound", "outbound"]).optional(),
  endpointId: z.string().uuid().optional(), eventType: z.string().trim().max(120).optional(),
  from: z.string().datetime().optional(), to: z.string().datetime().optional(),
  payloadPath: z.string().trim().regex(/^[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9_-]+){0,9}$/).optional(), payloadValue: z.string().trim().max(300).optional(),
  headerName: z.string().trim().regex(/^[a-zA-Z0-9-]{1,80}$/).optional(), headerValue: z.string().trim().max(300).optional()
});
const createSchema = z.object({ eventIds: z.array(z.string().uuid()).max(500).optional(), filters: filterSchema.optional(), maxEvents: z.number().int().min(1).max(500).default(100), rateLimitPerMinute: z.number().int().min(1).max(10000).default(120) }).refine((value) => value.eventIds?.length || value.filters, "Provide event IDs or replay filters");
const batchQuery = z.object({ batchId: z.string().uuid() });

export async function POST(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]);
    const body = createSchema.parse(await request.json());
    const params: unknown[] = [context.project.id];
    const clauses = ["ep.project_id = $1", "ep.deleted_at is null", "ep.is_active = true", "e.status in ('delivered','failed','dead_letter','cancelled')"];
    const add = (value: unknown, clause: (index: number) => string) => { params.push(value); clauses.push(clause(params.length)); };
    if (body.eventIds?.length) add([...new Set(body.eventIds)], (index) => `e.id = any($${index}::uuid[])`);
    const filters = body.filters;
    if (filters?.status) add(filters.status, (index) => `e.status = $${index}`);
    if (filters?.direction) add(filters.direction, (index) => `e.direction = $${index}`);
    if (filters?.endpointId) add(filters.endpointId, (index) => `e.endpoint_id = $${index}::uuid`);
    if (filters?.eventType) add(filters.eventType, (index) => `e.event_type = $${index}`);
    if (filters?.from) add(filters.from, (index) => `e.received_at >= $${index}::timestamptz`);
    if (filters?.to) add(filters.to, (index) => `e.received_at <= $${index}::timestamptz`);
    if (filters?.payloadPath) { add(filters.payloadPath.split("."), (index) => filters.payloadValue ? `e.request_body #>> $${index}::text[] = $${index + 1}` : `e.request_body #> $${index}::text[] is not null`); if (filters.payloadValue) params.push(filters.payloadValue); }
    if (filters?.headerName) { add(filters.headerName, (index) => filters.headerValue ? `coalesce(e.request_headers ->> lower($${index}), e.request_headers ->> $${index}) = $${index + 1}` : `(e.request_headers ? lower($${index}) or e.request_headers ? $${index})`); if (filters.headerValue) params.push(filters.headerValue); }
    params.push(body.maxEvents);
    const sql = requireSql();
    const targets = await sql.query(`select distinct on (coalesce(e.provider_event_id, e.id::text)) e.id, e.endpoint_id, coalesce(a.attempt_count,0)::int as attempt_count, ep.rate_limit_per_minute from webhook_events e join endpoints ep on ep.id=e.endpoint_id left join lateral (select count(*)::int attempt_count from delivery_attempts where event_id=e.id) a on true where ${clauses.join(" and ")} order by coalesce(e.provider_event_id,e.id::text), e.received_at desc limit $${params.length}`, params) as ReplayTarget[];
    if (!targets.length) return NextResponse.json({ ok: false, error: "No replayable deliveries found" }, { status: 404 });
    const [batch] = await sql`insert into replay_batches (project_id, created_by, filters, rate_limit_per_minute, requested_count, accepted_count) values (${context.project.id}, ${context.user.id}, ${JSON.stringify(body.filters || { eventIds: body.eventIds })}::jsonb, ${body.rateLimitPerMinute}, ${targets.length}, ${targets.length}) returning id, status, created_at`;
    for (let index = 0; index < targets.length; index += 25) {
      const chunk = targets.slice(index, index + 25);
      await Promise.all(chunk.map(async (target, offset) => {
        const position = index + offset;
        await sql`insert into replay_batch_items (batch_id, event_id, position) values (${batch.id}, ${target.id}, ${position}) on conflict do nothing`;
        const availableAt = new Date(Date.now() + Math.floor(position / body.rateLimitPerMinute) * 60_000);
        return scheduleReplay(target, { availableAt, batchId: String(batch.id) });
      }));
    }
    after(() => dispatchOutboxBatch(Math.min(targets.length, 100)));
    await writeAudit(context.organization.id, context.user.id, "event.bulk_replay_accepted", "replay_batch", String(batch.id), { accepted: targets.length, rateLimitPerMinute: body.rateLimitPerMinute });
    return NextResponse.json({ ok: true, batchId: batch.id, accepted: targets.length, deduplicated: (body.eventIds?.length || targets.length) - targets.length, rateLimitPerMinute: body.rateLimitPerMinute }, { status: 202 });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : result.message }, { status: error instanceof z.ZodError ? 400 : result.status }); }
}

export async function GET(request: Request) {
  try {
    const context = await requireSession(); const { batchId } = batchQuery.parse(Object.fromEntries(new URL(request.url).searchParams)); const sql = requireSql();
    const [batch] = await sql`select b.id, b.status, b.rate_limit_per_minute, b.requested_count, b.accepted_count, b.created_at, b.cancelled_at, count(*) filter (where e.status='delivered')::int delivered, count(*) filter (where e.status in ('failed','dead_letter'))::int failed, count(*) filter (where e.status not in ('delivered','failed','dead_letter','cancelled'))::int pending from replay_batches b join replay_batch_items bi on bi.batch_id=b.id join webhook_events e on e.id=bi.event_id where b.id=${batchId} and b.project_id=${context.project.id} group by b.id`;
    if (!batch) return NextResponse.json({ ok: false, error: "Replay batch not found" }, { status: 404 });
    if (batch.status === "running" && Number(batch.pending) === 0) { await sql`update replay_batches set status='completed',updated_at=now() where id=${batchId} and status='running'`; batch.status = "completed"; }
    return NextResponse.json({ ok: true, batch });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status }); }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]); const { batchId } = batchQuery.parse(await request.json()); const sql = requireSql();
    const [batch] = await sql`update replay_batches set status='cancelled', cancelled_at=now(), updated_at=now() where id=${batchId} and project_id=${context.project.id} and status='running' returning id`;
    if (!batch) return NextResponse.json({ ok: false, error: "Running replay batch not found" }, { status: 404 });
    await sql`update dispatch_jobs set status='failed', last_error='Replay batch cancelled', updated_at=now() where replay_batch_id=${batchId} and status='pending'`;
    await sql`update webhook_events e set status='cancelled', cancelled_at=now(), updated_at=now() from replay_batch_items i where i.batch_id=${batchId} and i.event_id=e.id and e.status='queued'`;
    await writeAudit(context.organization.id, context.user.id, "event.bulk_replay_cancelled", "replay_batch", batchId);
    return NextResponse.json({ ok: true, batchId });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status }); }
}
