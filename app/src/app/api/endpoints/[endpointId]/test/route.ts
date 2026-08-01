import { after } from "next/server";
import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { processDelivery } from "@/lib/delivery-worker";
import { enforceMonthlyMessageLimit, UsageLimitError } from "@/lib/limits";
import { enqueueDelivery, queueErrorMessage } from "@/lib/queue";
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
    const [message] = await sql`
      insert into messages (project_id, application_id, event_type, payload, status)
      values (${context.project.id}, ${endpoint.application_id}, 'payloadgrid.test', ${JSON.stringify(payload)}::jsonb, 'queued')
      returning id
    `;
    const [event] = await sql`
      insert into webhook_events (endpoint_id, application_id, message_id, direction, provider, provider_event_id, event_type, request_body, status, max_retries)
      values (${endpoint.id}, ${endpoint.application_id}, ${message.id}, 'outbound', 'payloadgrid', ${payload.id}, 'payloadgrid.test', ${JSON.stringify(payload)}::jsonb, 'queued', 3)
      returning id
    `;

    let scheduled = false;
    let queueError: string | null = null;
    try {
      const queued = await enqueueDelivery({ eventId: String(event.id), endpointId: String(endpoint.id), attempt: 1, rateLimitPerMinute: Number(endpoint.rate_limit_per_minute) });
      scheduled = queued.queued;
      if (!queued.queued) queueError = queued.reason;
    } catch (error) {
      queueError = queueErrorMessage(error);
      console.error("QStash endpoint test publish failed", { endpointId, eventId: String(event.id), error: queueError });
    }
    if (!scheduled) after(() => processDelivery(String(event.id)));
    await writeAudit(context.organization.id, context.user.id, "endpoint.test_accepted", "endpoint", endpointId, { eventId: String(event.id), scheduled });
    return NextResponse.json({ ok: true, eventId: String(event.id), status: "accepted", scheduled, queueError }, { status: 202 });
  } catch (error) {
    if (error instanceof UsageLimitError) return NextResponse.json({ ok: false, error: error.message }, { status: error.status });
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}