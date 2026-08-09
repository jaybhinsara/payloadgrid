import { after } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { scheduleReplay, type ReplayTarget } from "@/lib/delivery-operations";
import { dispatchOutboxBatch } from "@/lib/dispatch-outbox";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({ eventIds: z.array(z.string().uuid()).min(1).max(25) });

export async function POST(request: Request) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const { eventIds } = schema.parse(await request.json());
    const uniqueIds = [...new Set(eventIds)];
    const sql = requireSql();
    const targets = await sql.query(`
      select e.id, e.endpoint_id, count(a.id)::int as attempt_count, ep.rate_limit_per_minute
      from webhook_events e
      join endpoints ep on ep.id = e.endpoint_id
      left join delivery_attempts a on a.event_id = e.id
      where ep.project_id = $1 and ep.deleted_at is null and ep.is_active = true
        and e.status in ('delivered','failed','dead_letter','cancelled')
        and e.id = any($2::uuid[])
      group by e.id, e.endpoint_id, ep.rate_limit_per_minute
    `, [context.project.id, uniqueIds]) as ReplayTarget[];
    if (!targets.length) return NextResponse.json({ ok: false, error: "No replayable deliveries found" }, { status: 404 });

    const results = await Promise.all(targets.map((target) => scheduleReplay(target)));
    after(() => dispatchOutboxBatch(results.length));
    await writeAudit(context.organization.id, context.user.id, "event.bulk_replay_accepted", "event", undefined, {
      requested: uniqueIds.length, accepted: results.length, dispatchMode: "outbox"
    });
    return NextResponse.json({ ok: true, accepted: results.length, skipped: uniqueIds.length - results.length, results }, { status: 202 });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}
