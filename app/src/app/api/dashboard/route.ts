import { NextResponse } from "next/server";
import { appUrl, providers } from "@/lib/constants";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";

type CountRow = { count: string };

type MetricRow = {
  total_events: string;
  failed_events: string;
  retrying_events: string;
  delivered_events: string;
  revenue_at_risk: string;
  avg_latency: string | null;
};

async function ensureDefaultProject() {
  const sql = requireSql();
  const name = process.env.HOOKIN_DEFAULT_PROJECT_NAME || "HookIn Workspace";
  const slug = "default";
  const existing = await sql`select id, name, slug from projects where slug = ${slug} limit 1`;
  if (existing.length) return existing[0];
  const created = await sql`insert into projects (name, slug) values (${name}, ${slug}) returning id, name, slug`;
  return created[0];
}

export async function GET() {
  try {
    const sql = requireSql();
    const project = await ensureDefaultProject();

    const endpoints = await sql`
      select id, name, provider, destination_url, is_active, created_at
      from endpoints
      where project_id = ${project.id}
      order by created_at desc
    `;

    const events = await sql`
      select
        e.id,
        e.endpoint_id,
        e.provider,
        e.provider_event_id,
        e.event_type,
        e.status,
        e.revenue_at_risk,
        e.received_at,
        e.updated_at,
        e.request_headers,
        e.request_body,
        a.attempt_count,
        a.response_body,
        a.response_status,
        a.latency_ms,
        a.error
      from webhook_events e
      left join lateral (
        select response_status, latency_ms, error
        from delivery_attempts
        where event_id = e.id
        order by created_at desc
        limit 1
      ) a on true
      where e.endpoint_id in (select id from endpoints where project_id = ${project.id})
      order by e.received_at desc
      limit 100
    `;

    const [metrics] = await sql`
      select
        count(*)::text as total_events,
        count(*) filter (where status = 'failed')::text as failed_events,
        count(*) filter (where status = 'retrying')::text as retrying_events,
        count(*) filter (where status = 'delivered')::text as delivered_events,
        coalesce(sum(revenue_at_risk) filter (where status <> 'delivered'), 0)::text as revenue_at_risk,
        coalesce(avg(latest.latency_ms), 0)::text as avg_latency
      from webhook_events e
      left join lateral (
        select latency_ms
        from delivery_attempts
        where event_id = e.id
        order by created_at desc
        limit 1
      ) latest on true
      where e.endpoint_id in (select id from endpoints where project_id = ${project.id})
    `;

    const [endpointCount] = await sql`select count(*)::text as count from endpoints where project_id = ${project.id}`;
    const metricRow = metrics as MetricRow | undefined;
    const countRow = endpointCount as CountRow | undefined;
    const total = Number(metricRow?.total_events || 0);
    const delivered = Number(metricRow?.delivered_events || 0);

    return NextResponse.json({
      ok: true,
      appUrl: appUrl(),
      providers,
      project,
      endpoints,
      events,
      metrics: {
        totalEvents: total,
        failedEvents: Number(metricRow?.failed_events || 0),
        retryingEvents: Number(metricRow?.retrying_events || 0),
        openIncidents: Number(metricRow?.failed_events || 0) + Number(metricRow?.retrying_events || 0),
        successRate: total ? Math.round((delivered / total) * 1000) / 10 : 0,
        avgLatency: Math.round(Number(metricRow?.avg_latency || 0)),
        revenueAtRisk: Number(metricRow?.revenue_at_risk || 0),
        endpoints: Number(countRow?.count || 0)
      }
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Dashboard failed" }, { status: 500 });
  }
}

