import { after, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { requirePlatformAdmin } from "@/lib/operator";
import { planLimits } from "@/lib/limits";
import { writePlatformAudit } from "@/lib/platform-audit";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ workspaceId: string }> };
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pause"), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("resume"), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("set_capacity"), reason: z.string().trim().min(3).max(500), messageLimit: z.number().int().positive().max(100_000_000), expiresAt: z.string().datetime() }),
  z.object({ action: z.literal("clear_capacity"), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("set_delivery_limits"), reason: z.string().trim().min(3).max(500), ratePerMinute: z.number().int().min(1).max(1_000_000), parallelism: z.number().int().min(1).max(1_000) })
]);
const noteSchema = z.object({ note: z.string().trim().min(3).max(2000) });

async function getWorkspace(workspaceId: string) {
  const sql = requireSql();
  const [workspace] = await sql`
    select o.id, o.name, o.slug, o.plan, o.delivery_paused_at, o.delivery_pause_reason,
      o.delivery_rate_per_minute, o.delivery_parallelism,
      case when o.temporary_limit_expires_at > now() then o.temporary_message_limit else null end as temporary_message_limit,
      case when o.temporary_limit_expires_at > now() then o.temporary_limit_expires_at else null end as temporary_limit_expires_at,
      case when o.temporary_limit_expires_at > now() then o.temporary_limit_reason else null end as temporary_limit_reason,
      subscription.status as billing_status, subscription.current_period_end
    from organizations o left join billing_subscriptions subscription on subscription.organization_id=o.id
    where o.id=${workspaceId} limit 1
  `;
  return workspace;
}

export async function GET(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    const sql = requireSql();
    const [queue, notes] = await Promise.all([
      sql`select count(*) filter (where e.status in ('queued','buffered','processing','received','retrying'))::int as pending, count(*) filter (where e.status='dead_letter' and e.resolved_at is null)::int as dead_letter, min(e.received_at) filter (where e.status in ('queued','buffered','processing','received','retrying')) as oldest_pending,
        (select count(*)::int from dispatch_jobs j join webhook_events je on je.id=j.event_id join endpoints jep on jep.id=je.endpoint_id join projects jp on jp.id=jep.project_id where jp.organization_id=${workspaceId} and j.status in ('pending','publishing')) as pending_dispatch,
        (select min(j.created_at) from dispatch_jobs j join webhook_events je on je.id=j.event_id join endpoints jep on jep.id=je.endpoint_id join projects jp on jp.id=jep.project_id where jp.organization_id=${workspaceId} and j.status in ('pending','publishing')) as oldest_dispatch,
        (select count(*)::int from dispatch_jobs j join webhook_events je on je.id=j.event_id join endpoints jep on jep.id=je.endpoint_id join projects jp on jp.id=jep.project_id where jp.organization_id=${workspaceId} and j.last_error is not null and j.last_error <> 'Endpoint delivery rate limit deferred this event' and j.updated_at >= now() - interval '1 hour') as dispatch_errors_last_hour,
        ((select count(*) from messages m join projects mp on mp.id=m.project_id where mp.organization_id=${workspaceId} and m.created_at >= date_trunc('month', now())) +
         (select count(*) from webhook_events ie join endpoints iep on iep.id=ie.endpoint_id join projects ip on ip.id=iep.project_id where ip.organization_id=${workspaceId} and ie.direction='inbound' and ie.is_simulation=false and ie.received_at >= date_trunc('month', now())))::int as accepted_events
        from webhook_events e join endpoints ep on ep.id=e.endpoint_id join projects p on p.id=ep.project_id where p.organization_id=${workspaceId}`,
      sql`select n.id, n.note, n.created_at, coalesce(u.name, 'Deleted admin') as author_name, u.email as author_email from workspace_support_notes n left join users u on u.id=n.author_id where n.organization_id=${workspaceId} order by n.created_at desc limit 50`
    ]);
    return NextResponse.json({ ok: true, workspace: { ...workspace, plan_message_limit: planLimits(String(workspace.plan)).messagesPerMonth }, queue: queue[0], notes }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const body = actionSchema.parse(await request.json());
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    const sql = requireSql();
    if (body.action === "pause") await sql`update organizations set delivery_paused_at=coalesce(delivery_paused_at, now()), delivery_pause_reason=${body.reason}, delivery_paused_by=${context.user.id}, updated_at=now() where id=${workspaceId}`;
    if (body.action === "resume") {
      await sql`update organizations set delivery_paused_at=null, delivery_pause_reason=null, delivery_paused_by=null, updated_at=now() where id=${workspaceId}`;
      await sql`insert into dispatch_jobs (event_id, status, available_at, last_error, locked_at, qstash_message_id, published_at, updated_at) select e.id, 'pending', coalesce(e.next_retry_at, now()), null, null, null, null, now() from webhook_events e join endpoints ep on ep.id=e.endpoint_id join projects p on p.id=ep.project_id where p.organization_id=${workspaceId} and e.status in ('queued','received','retrying') on conflict (event_id) do update set status='pending', available_at=excluded.available_at, last_error=null, locked_at=null, qstash_message_id=null, published_at=null, updated_at=now()`;
      after(() => dispatchOutboxBatch(100));
    }
    if (body.action === "set_capacity") {
      const expiresAt = new Date(body.expiresAt);
      if (expiresAt <= new Date() || expiresAt.getTime() > Date.now() + 90 * 86400_000) return NextResponse.json({ ok: false, error: "Capacity expiry must be within the next 90 days" }, { status: 400 });
      const baseLimit = planLimits(String(workspace.plan)).messagesPerMonth;
      if (body.messageLimit < baseLimit) return NextResponse.json({ ok: false, error: `Temporary capacity cannot be below the ${baseLimit.toLocaleString()} event plan limit` }, { status: 400 });
      await sql`update organizations set temporary_message_limit=${body.messageLimit}, temporary_limit_expires_at=${body.expiresAt}, temporary_limit_reason=${body.reason}, updated_at=now() where id=${workspaceId}`;
    }
    if (body.action === "clear_capacity") await sql`update organizations set temporary_message_limit=null, temporary_limit_expires_at=null, temporary_limit_reason=null, updated_at=now() where id=${workspaceId}`;
    if (body.action === "set_delivery_limits") await sql`update organizations set delivery_rate_per_minute=${body.ratePerMinute}, delivery_parallelism=${body.parallelism}, updated_at=now() where id=${workspaceId}`;
    const detail = { reason: body.reason, messageLimit: body.action === "set_capacity" ? body.messageLimit : null, expiresAt: body.action === "set_capacity" ? body.expiresAt : null, ratePerMinute: body.action === "set_delivery_limits" ? body.ratePerMinute : null, parallelism: body.action === "set_delivery_limits" ? body.parallelism : null };
    await Promise.all([
      writePlatformAudit(context.user.id, `support.workspace.${body.action}`, "organization", workspaceId, detail),
      writeAudit(workspaceId, context.user.id, `support.workspace.${body.action}`, "organization", workspaceId, detail)
    ]);
    return NextResponse.json({ ok: true, action: body.action });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}

export async function POST(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const workspaceId = z.string().uuid().parse((await contextValue.params).workspaceId);
    const body = noteSchema.parse(await request.json());
    const workspace = await getWorkspace(workspaceId);
    if (!workspace) return NextResponse.json({ ok: false, error: "Workspace not found" }, { status: 404 });
    const sql = requireSql();
    const [note] = await sql`insert into workspace_support_notes (organization_id, author_id, note) values (${workspaceId}, ${context.user.id}, ${body.note}) returning id, note, created_at`;
    await writePlatformAudit(context.user.id, "support.workspace.note_added", "organization", workspaceId, { noteId: note.id });
    return NextResponse.json({ ok: true, note }, { status: 201 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
