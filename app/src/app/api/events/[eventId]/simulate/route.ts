import { after, NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { requireSql } from "@/lib/db";
import { processDelivery } from "@/lib/delivery-worker";
import { enqueueDelivery } from "@/lib/queue";

export const runtime = "nodejs";

const schema = z.object({
  payload: z.unknown(),
  headers: z.record(z.string(), z.string()).default({})
});

export async function POST(request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const [source] = await sql`
      select e.endpoint_id, e.application_id, e.direction, e.provider, e.event_type,
        ep.rate_limit_per_minute, ep.circuit_state
      from webhook_events e join endpoints ep on ep.id = e.endpoint_id
      where e.id = ${eventId} and ep.project_id = ${context.project.id}
        and ep.deleted_at is null and ep.is_active = true
      limit 1
    `;
    if (!source) return NextResponse.json({ ok: false, error: "Event or active endpoint not found" }, { status: 404 });

    const rawBody = JSON.stringify(body.payload);
    const initialStatus = String(source.circuit_state) === "open" ? "buffered" : "queued";
    const [simulation] = await sql`
      insert into webhook_events (
        endpoint_id, application_id, direction, provider, event_type, request_headers,
        request_body, request_raw_body, request_content_type, status, max_retries,
        is_simulation, parent_event_id
      ) values (
        ${source.endpoint_id}, ${source.application_id}, ${source.direction}, 'payloadgrid-sandbox', ${source.event_type},
        ${JSON.stringify(body.headers)}::jsonb, ${rawBody}::jsonb, ${rawBody}, 'application/json',
        ${initialStatus}, 1, true, ${eventId}
      ) returning id
    `;

    let scheduled = false;
    if (initialStatus === "queued") {
      try {
        const queued = await enqueueDelivery({
          eventId: String(simulation.id), endpointId: String(source.endpoint_id), attempt: 1,
          rateLimitPerMinute: Number(source.rate_limit_per_minute || 120)
        });
        scheduled = queued.queued;
      } catch { scheduled = false; }
      if (!scheduled) after(() => processDelivery(String(simulation.id)));
    }
    await writeAudit(context.organization.id, context.user.id, "event.simulation_created", "event", String(simulation.id), { sourceEventId: eventId });
    return NextResponse.json({ ok: true, eventId: simulation.id, status: initialStatus, scheduled }, { status: 202 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
