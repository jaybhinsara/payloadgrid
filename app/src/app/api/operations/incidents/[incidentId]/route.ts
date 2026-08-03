import { NextResponse } from "next/server";
import { z } from "zod";
import { authErrorResponse, requireSession } from "@/lib/auth";
import { updateIncident } from "@/lib/monitoring";
import { requirePlatformOperator } from "@/lib/operator";

const schema = z.object({ status: z.enum(["identified", "monitoring", "resolved"]), message: z.string().trim().min(3).max(1000) });

export async function PATCH(request: Request, contextValue: { params: Promise<{ incidentId: string }> }) {
  try {
    const context = await requireSession();
    requirePlatformOperator(context);
    const { incidentId } = await contextValue.params;
    const body = schema.parse(await request.json());
    const incident = await updateIncident(incidentId, body.status, body.message, context.user.id);
    if (!incident) return NextResponse.json({ ok: false, error: "Incident not found" }, { status: 404 });
    return NextResponse.json({ ok: true, incident });
  } catch (error) {
    const authError = authErrorResponse(error);
    return NextResponse.json({ ok: false, error: authError.message }, { status: authError.status });
  }
}
