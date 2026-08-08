import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";

const transformationSchema = z.object({
  kind: z.literal("transformation"),
  name: z.string().trim().min(2).max(80),
  eventType: z.string().trim().max(120).nullable().optional(),
  config: z.object({
    addFields: z.record(z.string(), z.unknown()).optional(),
    removeFields: z.array(z.string().trim().min(1).max(120)).max(100).optional(),
    renameFields: z.record(z.string(), z.string()).optional(),
    mappings: z.array(z.object({ from: z.string().trim().min(1).max(160), to: z.string().trim().min(1).max(160) })).max(50).optional()
  }),
  isActive: z.boolean()
});

const alertSchema = z.object({
  kind: z.literal("alert"),
  name: z.string().trim().min(2).max(80),
  channel: z.enum(["email", "slack", "webhook"]),
  destination: z.string().trim().min(3).max(500),
  failureThreshold: z.number().int().min(1).max(100),
  windowMinutes: z.number().int().min(1).max(1440),
  isActive: z.boolean()
});

const updateSchema = z.discriminatedUnion("kind", [transformationSchema, alertSchema]);
const kindSchema = z.enum(["transformation", "alert"]);
type RouteContext = { params: Promise<{ resourceId: string }> };

async function validateAlertDestination(channel: "email" | "slack" | "webhook", destination: string) {
  if (channel === "email") return z.string().email().parse(destination);
  return assertSafeDestinationUrl(destination);
}

export async function PATCH(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const { resourceId } = await contextValue.params;
    const body = updateSchema.parse(await request.json());
    const sql = requireSql();

    if (body.kind === "transformation") {
      const [record] = await sql`
        update transformations set name = ${body.name}, event_type = ${body.eventType || null},
          config = ${JSON.stringify(body.config)}::jsonb, is_active = ${body.isActive}, updated_at = now()
        where id = ${resourceId} and project_id = ${context.project.id}
        returning id, name, event_type, config, is_active, created_at
      `;
      if (!record) return NextResponse.json({ ok: false, error: "Transformation not found" }, { status: 404 });
      await writeAudit(context.organization.id, context.user.id, "transformation.updated", "transformation", resourceId, { isActive: body.isActive });
      return NextResponse.json({ ok: true, record });
    }

    const destination = await validateAlertDestination(body.channel, body.destination);
    const [record] = await sql`
      update alert_rules set name = ${body.name}, channel = ${body.channel}, destination = ${destination},
        failure_threshold = ${body.failureThreshold}, window_minutes = ${body.windowMinutes}, is_active = ${body.isActive}
      where id = ${resourceId} and project_id = ${context.project.id}
      returning id, name, channel, destination, failure_threshold, window_minutes, is_active, created_at
    `;
    if (!record) return NextResponse.json({ ok: false, error: "Alert rule not found" }, { status: 404 });
    await writeAudit(context.organization.id, context.user.id, "alert.updated", "alert", resourceId, { isActive: body.isActive, channel: body.channel });
    return NextResponse.json({ ok: true, record });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}

export async function DELETE(request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin"]);
    const { resourceId } = await contextValue.params;
    const kind = kindSchema.parse(new URL(request.url).searchParams.get("kind"));
    const sql = requireSql();
    const records = kind === "transformation"
      ? await sql`delete from transformations where id = ${resourceId} and project_id = ${context.project.id} returning id`
      : await sql`delete from alert_rules where id = ${resourceId} and project_id = ${context.project.id} returning id`;
    if (!records.length) return NextResponse.json({ ok: false, error: `${kind === "alert" ? "Alert rule" : "Transformation"} not found` }, { status: 404 });
    await writeAudit(context.organization.id, context.user.id, `${kind}.deleted`, kind, resourceId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status });
  }
}
