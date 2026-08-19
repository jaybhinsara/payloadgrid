import { NextResponse } from "next/server";
import { requireSql } from "@/lib/db";
import { isValidPlaygroundToken, PLAYGROUND_RESPONSE_HEADERS } from "@/lib/playground";
import { sha256 } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request, contextValue: { params: Promise<{ token: string }> }) {
  try {
    const token = (await contextValue.params).token;
    if (!isValidPlaygroundToken(token)) {
      return NextResponse.json({ ok: false, error: "Invalid inbox" }, { status: 404, headers: PLAYGROUND_RESPONSE_HEADERS });
    }
    const sql = requireSql();
    const [inbox] = await sql`
      select id, request_count, expires_at
      from playground_inboxes
      where token_hash = ${sha256(token)} and expires_at > now()
      limit 1
    `;
    if (!inbox) {
      return NextResponse.json({ ok: false, error: "This playground inbox has expired" }, { status: 410, headers: PLAYGROUND_RESPONSE_HEADERS });
    }
    const requests = await sql`
      select id, method, content_type, headers, body_text, size_bytes, received_at
      from playground_requests
      where inbox_id = ${inbox.id}
      order by received_at desc
      limit 20
    `;
    return NextResponse.json({
      ok: true,
      expiresAt: inbox.expires_at,
      requestCount: Number(inbox.request_count),
      requests,
    }, { headers: PLAYGROUND_RESPONSE_HEADERS });
  } catch (error) {
    console.error("Playground inbox inspection failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to read the playground inbox" },
      { status: 500, headers: PLAYGROUND_RESPONSE_HEADERS },
    );
  }
}
