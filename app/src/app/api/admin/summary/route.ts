import { NextResponse } from "next/server";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/operator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const sql = requireSql();
    const [totalsRows, deliveryRows, workspaces, users, audits, publishingRows] = await Promise.all([
      sql`
        select
          (select count(*)::int from organizations) as workspaces,
          (select count(*)::int from users) as users,
          (select count(*)::int from projects) as projects,
          (select count(*)::int from endpoints where deleted_at is null) as endpoints
      `,
      sql`
        select
          count(*) filter (where received_at >= now() - interval '24 hours')::int as events_24h,
          count(*) filter (where received_at >= now() - interval '24 hours' and status = 'delivered')::int as delivered_24h,
          count(*) filter (where status in ('queued','buffered','processing','received','retrying'))::int as pending,
          count(*) filter (where status = 'dead_letter' and resolved_at is null)::int as dead_letter
        from webhook_events
        where received_at >= now() - interval '24 hours' or status in ('queued','buffered','processing','received','retrying','dead_letter')
      `,
      sql`
        with member_counts as (
          select organization_id, count(*)::int as total from organization_members group by organization_id
        ), project_counts as (
          select organization_id, count(*)::int as total from projects group by organization_id
        ), endpoint_counts as (
          select p.organization_id, count(*)::int as total from endpoints ep join projects p on p.id=ep.project_id
          where ep.deleted_at is null group by p.organization_id
        ), event_counts as (
          select p.organization_id, count(*)::int as monthly
          from webhook_events e join endpoints ep on ep.id=e.endpoint_id join projects p on p.id=ep.project_id
          where e.is_simulation=false and e.received_at >= date_trunc('month', now()) group by p.organization_id
        )
        select o.id, o.name, o.slug, o.plan, o.created_at, o.updated_at,
          coalesce(members.total, 0)::int as members,
          coalesce(projects.total, 0)::int as projects,
          coalesce(endpoints.total, 0)::int as endpoints,
          coalesce(events.monthly, 0)::int as events_this_month,
          subscription.status as billing_status,
          subscription.current_period_end
        from organizations o
        left join member_counts members on members.organization_id=o.id
        left join project_counts projects on projects.organization_id=o.id
        left join endpoint_counts endpoints on endpoints.organization_id=o.id
        left join event_counts events on events.organization_id=o.id
        left join billing_subscriptions subscription on subscription.organization_id=o.id
        order by o.created_at desc limit 250
      `,
      sql`
        select u.id, u.name, u.email, u.email_verified_at, u.verification_required, u.created_at,
          count(distinct om.organization_id)::int as workspace_count,
          coalesce(array_agg(distinct o.name) filter (where o.name is not null), '{}') as workspaces,
          coalesce(array_agg(distinct oa.provider) filter (where oa.provider is not null), '{}') as providers
        from users u
        left join organization_members om on om.user_id=u.id
        left join organizations o on o.id=om.organization_id
        left join oauth_accounts oa on oa.user_id=u.id
        group by u.id order by u.created_at desc limit 250
      `,
      sql`
        select l.id, l.action, l.resource_type, l.resource_id, l.detail, l.created_at,
          coalesce(u.name, 'System') as actor_name, u.email as actor_email
        from platform_audit_logs l left join users u on u.id=l.actor_id
        order by l.created_at desc limit 75
      `,
      sql`
        select
          count(*) filter (where status='published' and published_at <= now())::int as published,
          count(*) filter (where status='draft')::int as drafts,
          count(*) filter (where status='scheduled')::int as scheduled
        from blog_posts
      `
    ]);
    return NextResponse.json({ ok: true, totals: totalsRows[0], delivery: deliveryRows[0], publishing: publishingRows[0], workspaces, users, audits }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status, headers: { "cache-control": "no-store" } });
  }
}
