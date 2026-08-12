import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  range: z.enum(["24h", "7d", "30d"]).default("7d"),
  endpointId: z.string().uuid().optional(),
  eventType: z.string().trim().min(1).max(120).optional()
});

const rangeConfig = {
  "24h": { milliseconds: 24 * 60 * 60 * 1000, bucketMinutes: 60 },
  "7d": { milliseconds: 7 * 24 * 60 * 60 * 1000, bucketMinutes: 6 * 60 },
  "30d": { milliseconds: 30 * 24 * 60 * 60 * 1000, bucketMinutes: 24 * 60 }
} as const;

export async function GET(request: Request) {
  try {
    const context = await requireSession();
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const config = rangeConfig[input.range];
    const from = new Date(Date.now() - config.milliseconds).toISOString();
    const endpointId = input.endpointId || null;
    const eventType = input.eventType || null;
    const sql = requireSql();
    const [summaryRows, timelineRows, endpointRows, eventTypeRows, failureRows] = await Promise.all([
      sql`
        with scoped as (
          select e.id, e.status, e.retry_count, latest.latency_ms
          from webhook_events e
          join endpoints ep on ep.id = e.endpoint_id
          left join lateral (
            select latency_ms from delivery_attempts where event_id = e.id order by created_at desc limit 1
          ) latest on true
          where ep.project_id = ${context.project.id} and e.received_at >= ${from}
            and e.is_simulation = false
            and (${endpointId}::uuid is null or e.endpoint_id = ${endpointId}::uuid)
            and (${eventType}::text is null or e.event_type = ${eventType})
        )
        select count(*)::int total,
          count(*) filter (where status = 'delivered')::int delivered,
          count(*) filter (where status in ('failed','dead_letter','cancelled'))::int failed,
          count(*) filter (where status in ('queued','processing','received','retrying','buffered'))::int active,
          count(*) filter (where retry_count > 0)::int retried,
          coalesce(percentile_cont(0.5) within group (order by latency_ms) filter (where latency_ms is not null), 0)::float8 p50_latency,
          coalesce(percentile_cont(0.95) within group (order by latency_ms) filter (where latency_ms is not null), 0)::float8 p95_latency
        from scoped
      `,
      sql`
        select date_bin(${config.bucketMinutes} * interval '1 minute', e.received_at, timestamp with time zone '2000-01-01') bucket,
          count(*)::int total,
          count(*) filter (where e.status = 'delivered')::int delivered,
          count(*) filter (where e.status in ('failed','dead_letter','cancelled'))::int failed
        from webhook_events e join endpoints ep on ep.id = e.endpoint_id
        where ep.project_id = ${context.project.id} and e.received_at >= ${from}
          and e.is_simulation = false
          and (${endpointId}::uuid is null or e.endpoint_id = ${endpointId}::uuid)
          and (${eventType}::text is null or e.event_type = ${eventType})
        group by bucket order by bucket
      `,
      sql`
        select ep.id, ep.name, count(*)::int total,
          count(*) filter (where e.status = 'delivered')::int delivered,
          count(*) filter (where e.status in ('failed','dead_letter','cancelled'))::int failed
        from webhook_events e join endpoints ep on ep.id = e.endpoint_id
        where ep.project_id = ${context.project.id} and e.received_at >= ${from}
          and e.is_simulation = false
          and (${endpointId}::uuid is null or e.endpoint_id = ${endpointId}::uuid)
          and (${eventType}::text is null or e.event_type = ${eventType})
        group by ep.id, ep.name order by total desc limit 10
      `,
      sql`
        select e.event_type, count(*)::int total,
          count(*) filter (where e.status = 'delivered')::int delivered,
          count(*) filter (where e.status in ('failed','dead_letter','cancelled'))::int failed
        from webhook_events e join endpoints ep on ep.id = e.endpoint_id
        where ep.project_id = ${context.project.id} and e.received_at >= ${from}
          and e.is_simulation = false
          and (${endpointId}::uuid is null or e.endpoint_id = ${endpointId}::uuid)
          and (${eventType}::text is null or e.event_type = ${eventType})
        group by e.event_type order by total desc limit 10
      `,
      sql`
        select coalesce(latest.response_status::text, case when latest.error is not null then 'network_error' else e.status end) reason,
          count(*)::int count
        from webhook_events e join endpoints ep on ep.id = e.endpoint_id
        left join lateral (
          select response_status, error from delivery_attempts where event_id = e.id order by created_at desc limit 1
        ) latest on true
        where ep.project_id = ${context.project.id} and e.received_at >= ${from}
          and e.is_simulation = false and e.status in ('failed','dead_letter','cancelled')
          and (${endpointId}::uuid is null or e.endpoint_id = ${endpointId}::uuid)
          and (${eventType}::text is null or e.event_type = ${eventType})
        group by reason order by count desc limit 8
      `
    ]);
    const summary = summaryRows[0] || {};
    const total = Number(summary.total || 0);
    const delivered = Number(summary.delivered || 0);
    const failed = Number(summary.failed || 0);
    const retried = Number(summary.retried || 0);
    const terminal = delivered + failed;
    return NextResponse.json({
      ok: true, range: input.range, from,
      summary: { total, delivered, failed, active: Number(summary.active || 0), successRate: terminal ? Math.round(delivered / terminal * 1000) / 10 : 0, retryRate: total ? Math.round(retried / total * 1000) / 10 : 0, p50Latency: Math.round(Number(summary.p50_latency || 0)), p95Latency: Math.round(Number(summary.p95_latency || 0)) },
      timeline: timelineRows.map((row) => ({ bucket: new Date(String(row.bucket)).toISOString(), total: Number(row.total), delivered: Number(row.delivered), failed: Number(row.failed) })),
      endpoints: endpointRows.map((row) => ({ id: String(row.id), name: String(row.name), total: Number(row.total), delivered: Number(row.delivered), failed: Number(row.failed) })),
      eventTypes: eventTypeRows.map((row) => ({ eventType: String(row.event_type), total: Number(row.total), delivered: Number(row.delivered), failed: Number(row.failed) })),
      failures: failureRows.map((row) => ({ reason: String(row.reason), count: Number(row.count) }))
    });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: error instanceof z.ZodError ? "Invalid analytics filters" : result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
