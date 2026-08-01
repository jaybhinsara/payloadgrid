import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { appUrl, providers } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { BETA_LIMITS } from "@/lib/limits";
import { queueConfigured } from "@/lib/queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MetricRow = { total_events: string; terminal_events: string; queued_events: string; processing_events: string; failed_events: string; retrying_events: string; delivered_events: string; revenue_at_risk: Array<{ currency: string; amount: number | string }>; avg_latency: string | null };

export async function GET() {
  try {
    const context = await requireSession();
    const sql = requireSql();
    const [applications, endpoints, events, messages, eventTypes, apiKeys, members, transformations, alerts, auditLogs, metricRows, usageRows] = await Promise.all([
      sql`select id, name, uid, description, created_at from applications where project_id = ${context.project.id} order by created_at desc`,
      sql`
        select ep.id, ep.application_id, ep.name, ep.provider, ep.destination_url, case when ${context.organization.role === "viewer"} then null else ep.signing_secret end as signing_secret, ep.provider_verification_required, ep.provider_secret_hint, ep.is_active, ep.created_at,
          coalesce((select array_agg(s.event_type order by s.event_type) from endpoint_subscriptions s where s.endpoint_id = ep.id), '{}') as event_types
        from endpoints ep where ep.project_id = ${context.project.id} and ep.deleted_at is null order by ep.created_at desc
      `,
      sql`
        select e.id, e.endpoint_id, ep.name as endpoint_name, e.application_id, e.message_id, e.direction, e.provider, e.provider_event_id,
          e.event_type, e.status, e.revenue_at_risk, e.revenue_currency, e.received_at, e.updated_at, e.request_headers, e.request_body,
          e.retry_count, e.max_retries, e.next_retry_at, e.last_error,
          coalesce(a.attempt_count, 0) as attempt_count, a.response_body, a.response_status, a.latency_ms, a.error
        from webhook_events e
        join endpoints ep on ep.id = e.endpoint_id
        left join lateral (
          select latest.response_status, latest.response_body, latest.latency_ms, latest.error,
            (select count(*)::int from delivery_attempts counted where counted.event_id = e.id) as attempt_count
          from delivery_attempts latest where latest.event_id = e.id order by latest.created_at desc limit 1
        ) a on true
        where ep.project_id = ${context.project.id}
        order by e.received_at desc limit 100
      `,
      sql`select id, application_id, event_type, status, created_at from messages where project_id = ${context.project.id} order by created_at desc limit 50`,
      sql`select id, name, description, schema, created_at from event_types where project_id = ${context.project.id} order by name asc`,
      sql`select id, name, key_prefix, last_used_at, revoked_at, created_at from api_keys where project_id = ${context.project.id} order by created_at desc`,
      sql`select u.id, u.name, u.email, om.role, om.created_at from organization_members om join users u on u.id = om.user_id where om.organization_id = ${context.organization.id} order by om.created_at asc`,
      sql`select id, name, event_type, config, is_active, created_at from transformations where project_id = ${context.project.id} order by created_at desc`,
      sql`select id, name, channel, destination, failure_threshold, is_active, created_at from alert_rules where project_id = ${context.project.id} order by created_at desc`,
      sql`select id, action, resource_type, resource_id, metadata, created_at from audit_logs where organization_id = ${context.organization.id} order by created_at desc limit 30`,
      sql`
        select count(*)::text as total_events,
          count(*) filter (where status in ('delivered','failed'))::text as terminal_events,
          count(*) filter (where status = 'queued')::text as queued_events,
          count(*) filter (where status = 'processing')::text as processing_events,
          count(*) filter (where status = 'failed')::text as failed_events,
          count(*) filter (where status = 'retrying')::text as retrying_events,
          count(*) filter (where status = 'delivered')::text as delivered_events,
          coalesce((
            select jsonb_agg(jsonb_build_object('currency', risk.currency, 'amount', risk.amount) order by risk.amount desc)
            from (
              select risky.revenue_currency as currency, sum(risky.revenue_at_risk) as amount
              from webhook_events risky
              where risky.endpoint_id in (select id from endpoints where project_id = ${context.project.id})
                and risky.status <> 'delivered' and risky.revenue_currency is not null and risky.revenue_at_risk > 0
              group by risky.revenue_currency
            ) risk
          ), '[]'::jsonb) as revenue_at_risk,
          coalesce(avg(latest.latency_ms), 0)::text as avg_latency
        from webhook_events e
        left join lateral (select latency_ms from delivery_attempts where event_id = e.id order by created_at desc limit 1) latest on true
        where e.endpoint_id in (select id from endpoints where project_id = ${context.project.id})
      `,
      sql`
        select date_trunc('month', now()) as period_start,
          ((select count(*) from messages where project_id = ${context.project.id} and created_at >= date_trunc('month', now())) +
           (select count(*) from webhook_events e join endpoints ep on ep.id = e.endpoint_id where ep.project_id = ${context.project.id} and e.direction = 'inbound' and e.received_at >= date_trunc('month', now())))::int as accepted_events
      `
    ]);
    const metric = metricRows[0] as MetricRow | undefined;
    const total = Number(metric?.total_events || 0); const terminal = Number(metric?.terminal_events || 0); const delivered = Number(metric?.delivered_events || 0);
    return NextResponse.json({
      ok: true, appUrl: appUrl(), providers, context, applications, endpoints, events, messages, eventTypes, apiKeys, members, transformations, alerts, auditLogs, system: { queueConfigured: queueConfigured() }, usage: { periodStart: usageRows[0]?.period_start, acceptedEvents: Number(usageRows[0]?.accepted_events || 0), limits: BETA_LIMITS },
      metrics: {
        totalEvents: total, deliveredEvents: delivered, failedEvents: Number(metric?.failed_events || 0), retryingEvents: Number(metric?.retrying_events || 0), queuedEvents: Number(metric?.queued_events || 0), processingEvents: Number(metric?.processing_events || 0),
        openIncidents: Number(metric?.failed_events || 0) + Number(metric?.retrying_events || 0),
        successRate: terminal ? Math.round((delivered / terminal) * 1000) / 10 : 100,
        avgLatency: Math.round(Number(metric?.avg_latency || 0)), revenueAtRisk: metric?.revenue_at_risk || [], endpoints: endpoints.length
      }
    });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}