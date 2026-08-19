import { NextResponse } from "next/server";
import { requireSql } from "@/lib/db";
import {
  isValidPlaygroundToken,
  PLAYGROUND_MAX_BODY_BYTES,
  PLAYGROUND_MAX_REQUESTS,
  PLAYGROUND_RESPONSE_HEADERS,
  safePlaygroundHeaders,
} from "@/lib/playground";
import { sha256 } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...PLAYGROUND_RESPONSE_HEADERS,
      "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key, X-Event-Type, X-Request-Id, X-Signature",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  });
}

export async function POST(request: Request, contextValue: { params: Promise<{ token: string }> }) {
  try {
    const token = (await contextValue.params).token;
    if (!isValidPlaygroundToken(token)) {
      return NextResponse.json({ ok: false, error: "Inbox not found" }, { status: 404, headers: PLAYGROUND_RESPONSE_HEADERS });
    }
    const declaredSize = Number(request.headers.get("content-length") || 0);
    if (declaredSize > PLAYGROUND_MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Payload exceeds the 64 KB playground limit" }, { status: 413, headers: PLAYGROUND_RESPONSE_HEADERS });
    }
    const bodyText = await request.text();
    const sizeBytes = Buffer.byteLength(bodyText, "utf8");
    if (sizeBytes > PLAYGROUND_MAX_BODY_BYTES) {
      return NextResponse.json({ ok: false, error: "Payload exceeds the 64 KB playground limit" }, { status: 413, headers: PLAYGROUND_RESPONSE_HEADERS });
    }

    const sql = requireSql();
    const [inbox] = await sql`
      update playground_inboxes
      set request_count = request_count + 1
      where token_hash = ${sha256(token)}
        and expires_at > now()
        and request_count < ${PLAYGROUND_MAX_REQUESTS}
      returning id
    `;
    if (!inbox) {
      return NextResponse.json(
        { ok: false, error: "Inbox expired, not found, or request limit reached" },
        { status: 429, headers: PLAYGROUND_RESPONSE_HEADERS },
      );
    }
    const [captured] = await sql`
      insert into playground_requests (inbox_id, method, content_type, headers, body_text, size_bytes)
      values (
        ${inbox.id},
        'POST',
        ${request.headers.get("content-type")},
        ${JSON.stringify(safePlaygroundHeaders(request.headers))}::jsonb,
        ${bodyText},
        ${sizeBytes}
      )
      returning id, received_at
    `;
    return NextResponse.json({
      ok: true,
      accepted: true,
      requestId: captured.id,
      receivedAt: captured.received_at,
    }, { status: 202, headers: PLAYGROUND_RESPONSE_HEADERS });
  } catch (error) {
    console.error("Playground request capture failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to capture this request" },
      { status: 500, headers: PLAYGROUND_RESPONSE_HEADERS },
    );
  }
}
