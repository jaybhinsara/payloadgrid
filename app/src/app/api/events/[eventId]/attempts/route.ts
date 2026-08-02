import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contextValue: { params: Promise<{ eventId: string }> }) {
  try {
    const context = await requireSession();
    const eventId = z.string().uuid().parse((await contextValue.params).eventId);
    const sql = requireSql();
    const [event] = await sql`
      select e.id, e.event_type, e.status, e.endpoint_id, ep.name as endpoint_name,
        e.request_headers, e.request_body, e.next_retry_at, e.last_error, e.cancelled_at, e.dead_lettered_at
      from webhook_events e join endpoints ep on ep.id = e.endpoint_id
      where e.id = ${eventId} and ep.project_id = ${context.project.id}
      limit 1
    `;
    if (!event) return NextResponse.json({ ok: false, error: "Delivery not found" }, { status: 404 });
    const attempts = await sql`
      select id, attempt_number, destination_url, request_headers, response_status, response_headers,
        response_body, error, latency_ms, created_at
      from delivery_attempts where event_id = ${eventId}
      order by attempt_number asc, created_at asc
    `;
    return NextResponse.json({ ok: true, event, attempts });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: error instanceof z.ZodError ? 400 : result.status });
  }
}