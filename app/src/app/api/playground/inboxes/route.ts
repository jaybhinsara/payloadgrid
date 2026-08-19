import { NextResponse } from "next/server";
import { requireSql } from "@/lib/db";
import {
  getClientIp,
  PLAYGROUND_LIFETIME_MINUTES,
  PLAYGROUND_MAX_INBOXES_PER_HOUR,
  PLAYGROUND_MAX_REQUESTS,
  PLAYGROUND_RESPONSE_HEADERS,
} from "@/lib/playground";
import { randomToken, sha256 } from "@/lib/security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const sql = requireSql();
    const creatorIpHash = sha256(getClientIp(request));
    const [recent] = await sql`
      select count(*)::int as count
      from playground_inboxes
      where creator_ip_hash = ${creatorIpHash}
        and created_at >= now() - interval '1 hour'
    `;
    if (Number(recent?.count || 0) >= PLAYGROUND_MAX_INBOXES_PER_HOUR) {
      return NextResponse.json(
        { ok: false, error: "Too many playground inboxes. Try again in an hour." },
        { status: 429, headers: PLAYGROUND_RESPONSE_HEADERS },
      );
    }

    const token = randomToken(24);
    const [inbox] = await sql`
      insert into playground_inboxes (token_hash, creator_ip_hash, expires_at)
      values (${sha256(token)}, ${creatorIpHash}, now() + (${PLAYGROUND_LIFETIME_MINUTES} * interval '1 minute'))
      returning expires_at
    `;
    const origin = new URL(request.url).origin;
    return NextResponse.json({
      ok: true,
      token,
      ingestUrl: `${origin}/api/playground/in/${token}`,
      expiresAt: inbox.expires_at,
      maxRequests: PLAYGROUND_MAX_REQUESTS,
    }, { status: 201, headers: PLAYGROUND_RESPONSE_HEADERS });
  } catch (error) {
    console.error("Playground inbox creation failed", error);
    return NextResponse.json(
      { ok: false, error: "Unable to create a playground inbox" },
      { status: 500, headers: PLAYGROUND_RESPONSE_HEADERS },
    );
  }
}
