import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Cursor = { at: string; id: string };
const querySchema = z.object({
  endpointId: z.string().uuid(),
  cursor: z.string().max(500).optional(),
  history: z.enum(["true", "false"]).default("false"),
  limit: z.coerce.number().int().min(1).max(100).default(25)
});

function encodeCursor(cursor: Cursor) {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(value: string): Cursor {
  const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
  if (!parsed.at || !parsed.id || Number.isNaN(new Date(parsed.at).getTime())) throw new Error("Invalid relay cursor");
  return parsed;
}

export async function GET(request: Request) {
  try {
    const key = await authenticateApiKey(request, "events:read");
    if (!key) return NextResponse.json({ ok: false, error: "API key is invalid or lacks events:read" }, { status: 401 });
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const sql = requireSql();
    const [endpoint] = await sql`select id from endpoints where id = ${input.endpointId} and project_id = ${key.projectId} and deleted_at is null limit 1`;
    if (!endpoint) return NextResponse.json({ ok: false, error: "Endpoint not found in this project" }, { status: 404 });

    if (!input.cursor && input.history !== "true") {
      return NextResponse.json({ ok: true, events: [], cursor: encodeCursor({ at: new Date().toISOString(), id: "00000000-0000-0000-0000-000000000000" }) });
    }

    let rows: Record<string, unknown>[];
    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      rows = await sql.query(`
        select id, event_type, direction, provider, request_headers, request_body, request_raw_body,
          request_content_type, payload_redacted_at, received_at
        from webhook_events
        where endpoint_id = $1 and (received_at > $2::timestamptz or (received_at = $2::timestamptz and id > $3::uuid))
        order by received_at asc, id asc limit $4
      `, [input.endpointId, cursor.at, cursor.id, input.limit]) as Record<string, unknown>[];
    } else {
      const recent = await sql.query(`
        select id, event_type, direction, provider, request_headers, request_body, request_raw_body,
          request_content_type, payload_redacted_at, received_at
        from webhook_events where endpoint_id = $1
        order by received_at desc, id desc limit $2
      `, [input.endpointId, input.limit]) as Record<string, unknown>[];
      rows = recent.reverse();
    }

    const events = rows.map((row) => ({
      id: String(row.id),
      eventType: String(row.event_type),
      direction: String(row.direction),
      provider: String(row.provider),
      headers: row.request_headers || {},
      contentType: String(row.request_content_type || "application/json"),
      body: row.payload_redacted_at ? null : row.request_raw_body ?? JSON.stringify(row.request_body),
      receivedAt: new Date(String(row.received_at)).toISOString(),
      redacted: Boolean(row.payload_redacted_at)
    }));
    const last = events.at(-1);
    const cursor = last
      ? encodeCursor({ at: last.receivedAt, id: last.id })
      : input.cursor || encodeCursor({ at: new Date().toISOString(), id: "00000000-0000-0000-0000-000000000000" });
    return NextResponse.json({ ok: true, events, cursor }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const status = error instanceof z.ZodError || (error instanceof Error && error.message === "Invalid relay cursor") ? 400 : 500;
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Relay feed failed" }, { status });
  }
}
