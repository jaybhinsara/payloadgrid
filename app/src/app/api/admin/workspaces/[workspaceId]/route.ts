import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/operator";
import { writePlatformAudit } from "@/lib/platform-audit";

const schema = z.object({
  plan: z.enum(["free", "starter", "growth", "enterprise"]).optional(),
  name: z.string().trim().min(2).max(80).optional(),
  action: z.enum(["suspend", "reactivate"]).optional(),
  reason: z.string().trim().min(3).max(300).optional()
}).refine((value) => value.plan !== undefined || value.name !== undefined || value.action !== undefined, "No workspace changes supplied")
  .refine((value) => value.action !== "suspend" || Boolean(value.reason), { path: ["reason"], message: "A suspension reason is required" });
const deleteSchema = z.object({ confirmation: z.string() });
type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const sql = requireSql();
    const [workspace] = await sql`
      select o.id, o.name, o.slug, o.plan, o.created_at, o.suspended_at, o.suspension_reason,
        subscription.status as billing_status, subscription.current_period_end
      from organizations o left join billing_subscriptions subscription on subscription.organization_id=o.id
      where o.id=${workspaceId} limit 1
    `;
    if (!workspace) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    const [members, projects] = await Promise.all([
      sql`select u.id, u.name, u.email, u.suspended_at, om.role, om.created_at from organization_members om join users u on u.id=om.user_id where om.organization_id=${workspaceId} order by case om.role when 'owner' then 0 when 'admin' then 1 else 2 end, om.created_at`,
      sql`
        select p.id, p.name, p.slug, p.environment, p.created_at,
          count(distinct ep.id) filter (where ep.deleted_at is null)::int as endpoints,
          count(distinct a.id)::int as applications,
          count(distinct k.id) filter (where k.revoked_at is null)::int as active_keys
        from projects p left join endpoints ep on ep.project_id=p.id
        left join applications a on a.project_id=p.id left join api_keys k on k.project_id=p.id
        where p.organization_id=${workspaceId} group by p.id order by p.created_at
      `
    ]);
    return NextResponse.json({ ok: true, workspace, members, projects }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const body = schema.parse(await request.json());
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const sql = requireSql();
    const [current] = await sql`select id, name, slug, plan, suspended_at, suspension_reason from organizations where id=${workspaceId} limit 1`;
    if (!current) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    if (body.action) {
      if (workspaceId === context.organization.id) return NextResponse.json({ ok: false, error: "Switch to another active workspace before changing this workspace lifecycle" }, { status: 409 });
      if (body.action === "suspend") {
        await sql`update organizations set suspended_at=coalesce(suspended_at, now()), suspension_reason=${body.reason || null}, suspended_by=${context.user.id}, updated_at=now() where id=${workspaceId}`;
      } else {
        await sql`update organizations set suspended_at=null, suspension_reason=null, suspended_by=null, updated_at=now() where id=${workspaceId}`;
        await sql`
          insert into dispatch_jobs (event_id, status, available_at, last_error, locked_at, qstash_message_id, published_at, updated_at)
          select e.id, 'pending', coalesce(e.next_retry_at, now()), null, null, null, null, now()
          from webhook_events e join endpoints ep on ep.id=e.endpoint_id join projects p on p.id=ep.project_id
          where p.organization_id=${workspaceId} and e.status in ('queued','received','retrying')
          on conflict (event_id) do update set status='pending', available_at=excluded.available_at,
            last_error=null, locked_at=null, qstash_message_id=null, published_at=null, updated_at=now()
        `;
      }
      await writePlatformAudit(context.user.id, `workspace.${body.action}`, "organization", workspaceId, { name: current.name, reason: body.reason || null });
      return NextResponse.json({ ok: true, action: body.action });
    }
    const nextPlan = body.plan ?? String(current.plan);
    const nextName = body.name ?? String(current.name);
    const [workspace] = await sql`update organizations set plan=${nextPlan}, name=${nextName}, updated_at=now() where id=${workspaceId} returning id, name, slug, plan, updated_at`;
    if (body.plan !== undefined) {
      // Record the grant in the billing ledger as a 'manual' subscription (no end
      // date) so the maintenance cron's plan-expiry sweep -- which only reverts
      // 'razorpay' subscriptions -- can never silently downgrade an admin override,
      // and so admin-granted plans are auditable the same way paid ones are.
      // billing_subscriptions.plan only allows starter/growth/enterprise, so a
      // downgrade to free instead cancels any manual grant on record.
      if (nextPlan === "free") {
        await sql`update billing_subscriptions set status = 'cancelled', cancel_at_period_end = true, updated_at = now() where organization_id = ${workspaceId} and provider = 'manual'`;
      } else {
        await sql`
          insert into billing_subscriptions (organization_id, provider, plan, status, current_period_start, current_period_end, cancel_at_period_end)
          values (${workspaceId}, 'manual', ${nextPlan}, 'active', now(), null, false)
          on conflict (organization_id) do update set
            provider = 'manual', plan = excluded.plan, status = 'active',
            current_period_start = now(), current_period_end = null, cancel_at_period_end = false, updated_at = now()
        `;
      }
    }
    await writePlatformAudit(context.user.id, "workspace.updated", "organization", workspaceId, {
      previousName: current.name, name: nextName, previousPlan: current.plan, plan: nextPlan
    });
    return NextResponse.json({ ok: true, workspace });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const body = deleteSchema.parse(await request.json());
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const sql = requireSql();
    const [workspace] = await sql`
      select o.id, o.name, o.slug, o.plan, subscription.status as billing_status
      from organizations o left join billing_subscriptions subscription on subscription.organization_id=o.id
      where o.id=${workspaceId} limit 1
    `;
    if (!workspace) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    if (body.confirmation !== workspace.name) return NextResponse.json({ ok: false, error: "Workspace name confirmation did not match" }, { status: 400 });
    if (["trialing", "active", "past_due"].includes(String(workspace.billing_status || ""))) {
      return NextResponse.json({ ok: false, error: "Cancel the active subscription before deleting this workspace" }, { status: 409 });
    }
    await writePlatformAudit(context.user.id, "workspace.deleted", "organization", workspaceId, {
      name: workspace.name, slug: workspace.slug, plan: workspace.plan
    });
    await sql`delete from organizations where id=${workspaceId}`;
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}
