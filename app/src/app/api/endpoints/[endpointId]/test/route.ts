import { after } from "next/server";
import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { enforceMonthlyMessageLimit, UsageLimitError } from "@/lib/limits";
import { randomToken } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ endpointId: string }> };

export async function POST(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const { endpointId } = await contextValue.params;
    await enforceMonthlyMessageLimit(context.project.id);
    const sql = requireSql();
    const [endpoint] = await sql`
      select id, application_id, rate_limit_per_minute from endpoints
      where id = ${endpointId} and project_id = ${context.project.id} and application_id is not null and deleted_at is null and is_active = true
      limit 1
    `;
    if (!endpoint) return NextResponse.json({ ok: false, error: "Active endpoint not found" }, { status: 404 });

    const payload = {
      event: "payloadgrid.test",
      id: `test_${randomToken(10)}`,
      createdAt: new Date().toISOString(),
      data: { message: "Test delivery from PayloadGrid", endpointId }
    };
    const [event] = await sql`
      with inserted_message as (
        insert into messages (project_id, application_id, event_type, payload, status)
        values (${context.project.id}, ${endpoint.application_id}, 'payloadgrid.test', ${JSON.stringify(payload)}::jsonb, 'queued')
        returning id
      ), inserted_event as (
        insert into webhook_events (endpoint_id, application_id, message_id, direction, provider, provider_event_id, event_type, request_body, status, max_retries)
        select ${endpoint.id}, ${endpoint.application_id}, id, 'outbound', 'payloadgrid', ${payload.id},
          'payloadgrid.test', ${JSON.stringify(payload)}::jsonb, 'queued', 3 from inserted_message
        returning id
      ), inserted_job as (
        insert into dispatch_jobs (event_id, status, available_at)
        select id, 'pending', now() from inserted_event returning event_id
      )
      select id from inserted_event
    `;

    const scheduled = true;
    const queueError: string | null = null;
    after(() => dispatchOutboxBatch(1, String(event.id)));
    await writeAudit(context.organization.id, context.user.id, "endpoint.test_accepted", "endpoint", endpointId, { eventId: String(event.id), scheduled });
    return NextResponse.json({ ok: true, eventId: String(event.id), status: "accepted", scheduled, queueError }, { status: 202 });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}
