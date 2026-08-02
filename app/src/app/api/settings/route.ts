import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { assertSafeDestinationUrl } from "@/lib/destination-security";
import { requireSql } from "@/lib/db";

const transformSchema = z.object({ kind: z.literal("transformation"), name: z.string().min(2).max(80), eventType: z.string().max(120).optional(), config: z.object({ addFields: z.record(z.string(), z.unknown()).optional(), removeFields: z.array(z.string()).optional(), renameFields: z.record(z.string(), z.string()).optional() }) });
const alertSchema = z.object({ kind: z.literal("alert"), name: z.string().min(2).max(80), channel: z.enum(["email", "slack", "webhook"]), destination: z.string().min(3).max(500), failureThreshold: z.number().int().min(1).max(100).default(3), windowMinutes: z.number().int().min(1).max(1440).default(15) });
const schema = z.discriminatedUnion("kind", [transformSchema, alertSchema]);
export async function POST(request: Request) {
  try { const context = await requireSession(); requireRole(context, ["owner", "admin", "developer"]); const body = schema.parse(await request.json()); const sql = requireSql();
    if (body.kind === "transformation") { const [record] = await sql`insert into transformations (project_id, name, event_type, config) values (${context.project.id}, ${body.name}, ${body.eventType || null}, ${JSON.stringify(body.config)}::jsonb) returning id, name, event_type, config, is_active, created_at`; await writeAudit(context.organization.id, context.user.id, "transformation.created", "transformation", String(record.id)); return NextResponse.json({ ok: true, record }, { status: 201 }); }
    const destination = body.channel === "email" ? z.string().email().parse(body.destination) : await assertSafeDestinationUrl(body.destination);
    const [record] = await sql`insert into alert_rules (project_id, name, channel, destination, failure_threshold, window_minutes) values (${context.project.id}, ${body.name}, ${body.channel}, ${destination}, ${body.failureThreshold}, ${body.windowMinutes}) returning id, name, channel, destination, failure_threshold, window_minutes, is_active, created_at`; await writeAudit(context.organization.id, context.user.id, "alert.created", "alert", String(record.id)); return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) { const result = authErrorResponse(error); return NextResponse.json({ ok: false, error: result.message }, { status: result.status === 500 ? 400 : result.status }); }
}