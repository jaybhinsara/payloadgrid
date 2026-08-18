import { after, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { scheduleReplay } from "@/lib/delivery-operations";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { requireSql } from "@/lib/db";
import { verifyEmbedToken } from "@/lib/embed";

export const runtime = "nodejs";

export async function POST(request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Embed ") ? authorization.slice(6) : "";
  const claims = verifyEmbedToken(token);
  if (!claims || !claims.permissions.includes("deliveries:replay")) return NextResponse.json({ ok: false, error: "Embed token cannot replay deliveries" }, { status: 403 });
  try {
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const sql = requireSql();
    const [event] = await sql`
      select e.id, e.endpoint_id, count(a.id)::int as attempt_count, ep.rate_limit_per_minute,
        p.organization_id
      from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      join projects p on p.id = ep.project_id
      join organizations o on o.id = p.organization_id
      left join delivery_attempts a on a.event_id = e.id
      where e.id = ${eventId} and e.application_id = ${claims.applicationId}
        and ep.project_id = ${claims.projectId} and ep.deleted_at is null and ep.is_active = true
        and o.suspended_at is null
        and e.status in ('delivered','failed','dead_letter','cancelled')
      group by e.id, e.endpoint_id, ep.rate_limit_per_minute, p.organization_id
      limit 1
    `;
    if (!event) return NextResponse.json({ ok: false, error: "Replayable delivery not found" }, { status: 404 });
    await scheduleReplay({ id: String(event.id), endpoint_id: String(event.endpoint_id), attempt_count: Number(event.attempt_count), rate_limit_per_minute: Number(event.rate_limit_per_minute) });
    after(() => dispatchOutboxBatch(1, String(event.id)));
    await writeAudit(String(event.organization_id), null, "embed.delivery_replay_accepted", "event", eventId, { applicationId: claims.applicationId });
    return NextResponse.json({ ok: true, status: "accepted" }, { status: 202 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Embedded replay failed" }, { status: 400 });
  }
}
