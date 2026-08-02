import { NextResponse } from "next/server";
import { authErrorResponse, requireRole, requireSession } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { deliverAlert } from "@/lib/alerts";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";
type RouteContext = { params: Promise<{ resourceId: string }> };

export async function POST(_request: Request, contextValue: RouteContext) {
  try {
    const context = await requireSession();
    requireRole(context, ["owner", "admin", "developer"]);
    const { resourceId } = await contextValue.params;
    const sql = requireSql();
    const [rule] = await sql`
      select id, name, channel, destination from alert_rules
      where id = ${resourceId} and project_id = ${context.project.id} limit 1
    `;
    if (!rule) return NextResponse.json({ ok: false, error: "Alert rule not found" }, { status: 404 });
    const response = await deliverAlert(rule, {
      source: "PayloadGrid",
      alert: String(rule.name),
      eventId: "test",
      eventType: "payloadgrid.alert_test",
      error: "This is a test alert from your PayloadGrid workspace.",
      failuresInWindow: 1,
      occurredAt: new Date().toISOString()
    });
    await writeAudit(context.organization.id, context.user.id, "alert.tested", "alert", resourceId, { responseStatus: response.status });
    if (!response.ok) return NextResponse.json({ ok: false, error: `Alert destination returned HTTP ${response.status}`, responseStatus: response.status }, { status: 502 });
    return NextResponse.json({ ok: true, responseStatus: response.status });
  } catch (error) {
    const result = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: result.message }, { status: result.status });
  }
}