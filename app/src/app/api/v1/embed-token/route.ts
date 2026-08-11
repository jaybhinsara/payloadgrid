import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { writeAudit } from "@/lib/audit";
import { appUrl } from "@/lib/constants";
import { requireSql } from "@/lib/db";
import { createEmbedToken } from "@/lib/embed";
import { enforceApiRateLimit } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  applicationId: z.string().uuid(),
  expiresInMinutes: z.number().int().min(5).max(60).default(30),
  permissions: z.array(z.enum(["deliveries:read", "deliveries:replay", "endpoints:read", "endpoints:write", "subscriptions:write", "secrets:rotate"])).min(1).max(6).default(["deliveries:read"])
});

export async function POST(request: Request) {
  try {
    const key = await authenticateApiKey(request, "embeds:write");
    if (!key) return NextResponse.json({ ok: false, error: "API key is invalid or lacks embeds:write" }, { status: 401 });
    await enforceApiRateLimit(key.keyId);
    const body = schema.parse(await request.json());
    const sql = requireSql();
    const [application] = await sql`select id from applications where id = ${body.applicationId} and project_id = ${key.projectId} limit 1`;
    if (!application) return NextResponse.json({ ok: false, error: "Application not found in this project" }, { status: 404 });

    const token = createEmbedToken({
      projectId: key.projectId,
      applicationId: body.applicationId,
      permissions: body.permissions,
      exp: Math.floor(Date.now() / 1000) + body.expiresInMinutes * 60
    });
    await writeAudit(key.organizationId, null, "embed_token.created", "application", body.applicationId, { keyId: key.keyId, permissions: body.permissions, expiresInMinutes: body.expiresInMinutes });
    return NextResponse.json({ ok: true, url: `${appUrl()}/embed/deliveries?token=${encodeURIComponent(token)}`, expiresInMinutes: body.expiresInMinutes }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Embed token creation failed" }, { status: error instanceof z.ZodError ? 400 : 500 });
  }
}
