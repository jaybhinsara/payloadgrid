import { after, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";
import { scheduleReplay } from "@/lib/delivery-operations";
import { updateMessageStatus } from "@/lib/delivery-worker";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { requirePlatformAdmin } from "@/lib/operator";
import { writePlatformAudit } from "@/lib/platform-audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ eventId: string }> };
const actionSchema = z.object({
  action: z.enum(["retry", "cancel", "dead_letter", "resolve", "archive"]),
  reason: z.string().trim().min(3).max(1000)
});

function safeDestination(value: unknown) {
  try {
    const url = new URL(String(value));
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch { return "Configured destination"; }
}

async function findEvent(eventId: string) {
  const sql = requireSql();
  const [event] = await sql`
    select e.id, e.endpoint_id, e.message_id, e.status, e.resolved_at, e.event_type, e.provider_event_id,
      e.direction, e.retry_count, e.max_retries, e.next_retry_at, e.last_error, e.received_at, e.updated_at,
      e.support_archived_at, e.support_archive_reason,
      ep.name as endpoint_name, ep.rate_limit_per_minute, p.id as project_id, p.name as project_name,
      o.id as workspace_id, o.name as workspace_name,
      coalesce((select count(*) from delivery_attempts where event_id=e.id), 0)::int as attempt_count,
      jobs.status as job_status, jobs.available_at, jobs.publish_attempts, jobs.last_error as job_error
    from webhook_events e join endpoints ep on ep.id=e.endpoint_id
    join projects p on p.id=ep.project_id join organizations o on o.id=p.organization_id
    left join dispatch_jobs jobs on jobs.event_id=e.id
    where e.id=${eventId} limit 1
  `;
  return event;
}

export async function GET(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const event = await findEvent(eventId);
    if (!event) return NextResponse.json({ ok: false, error: "Delivery not found" }, { status: 404 });
    const sql = requireSql();
    const attemptRows = await sql`
      select id, attempt_number, response_status, error, latency_ms, created_at,
        destination_url
      from delivery_attempts where event_id=${eventId} order by attempt_number desc limit 50
    `;
    const attempts = attemptRows.map((attempt) => ({ ...attempt, destination: safeDestination(attempt.destination_url), destination_url: undefined }));
    const displayStatus = event.support_archived_at ? "archived" : event.status === "dead_letter" && event.resolved_at ? "resolved" : event.status;
    return NextResponse.json({ ok: true, event: { ...event, status: displayStatus }, attempts }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requirePlatformAdmin(context);
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const body = actionSchema.parse(await request.json());
    const event = await findEvent(eventId);
    if (!event) return NextResponse.json({ ok: false, error: "Delivery not found" }, { status: 404 });
    const sql = requireSql();
    let nextStatus = String(event.status);
    if (body.action === "retry") {
      if (!["delivered", "failed", "dead_letter", "cancelled"].includes(String(event.status))) return NextResponse.json({ ok: false, error: "Only terminal deliveries can be retried" }, { status: 409 });
      await scheduleReplay({ id: eventId, endpoint_id: String(event.endpoint_id), attempt_count: Number(event.attempt_count), rate_limit_per_minute: Number(event.rate_limit_per_minute) });
      after(() => dispatchOutboxBatch(1, eventId));
      nextStatus = "queued";
    } else if (body.action === "cancel") {
      const [updated] = await sql`update webhook_events set status='cancelled', cancelled_at=now(), dead_lettered_at=null, next_retry_at=null, locked_at=null, last_error=${`Cancelled by platform support: ${body.reason}`}, updated_at=now() where id=${eventId} and status in ('queued','received','retrying') returning id`;
      if (!updated) return NextResponse.json({ ok: false, error: "Only queued or retrying deliveries can be cancelled" }, { status: 409 });
      await sql`update dispatch_jobs set status='cancelled', last_error=${`Cancelled by platform support: ${body.reason}`}, locked_at=null, updated_at=now() where event_id=${eventId} and status in ('pending','publishing','published')`;
      nextStatus = "cancelled";
    } else if (body.action === "dead_letter") {
      const [updated] = await sql`update webhook_events set status='dead_letter', dead_lettered_at=now(), cancelled_at=null, next_retry_at=null, locked_at=null, last_error=${`Moved by platform support: ${body.reason}`}, updated_at=now() where id=${eventId} and status='failed' returning id`;
      if (!updated) return NextResponse.json({ ok: false, error: "Only failed deliveries can be moved to dead letter" }, { status: 409 });
      nextStatus = "dead_letter";
    } else if (body.action === "resolve") {
      const [updated] = await sql`update webhook_events set resolved_at=now(), resolved_by=${context.user.id}, resolution_note=${body.reason}, revenue_at_risk=0, updated_at=now() where id=${eventId} and status='dead_letter' and resolved_at is null returning id`;
      if (!updated) return NextResponse.json({ ok: false, error: "Only open dead-letter deliveries can be resolved" }, { status: 409 });
      nextStatus = "resolved";
    } else {
      if (!["delivered", "failed", "dead_letter", "cancelled"].includes(String(event.status))) return NextResponse.json({ ok: false, error: "Only terminal deliveries can be archived" }, { status: 409 });
      await sql`update webhook_events set support_archived_at=now(), support_archived_by=${context.user.id}, support_archive_reason=${body.reason}, updated_at=now() where id=${eventId}`;
      nextStatus = "archived";
    }
    if (event.message_id && body.action !== "retry") await updateMessageStatus(String(event.message_id));
    const detail = { reason: body.reason, workspaceId: event.workspace_id, previousStatus: event.status, status: nextStatus };
    await Promise.all([
      writePlatformAudit(context.user.id, `support.delivery.${body.action}`, "event", eventId, detail),
      writeAudit(String(event.workspace_id), context.user.id, `support.delivery.${body.action}`, "event", eventId, detail)
    ]);
    return NextResponse.json({ ok: true, status: nextStatus });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
