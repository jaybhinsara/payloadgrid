import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/lib/api-auth";
import { requireSql } from "@/lib/db";

const query = z.object({ applicationId: z.string().uuid() });
export async function GET(request: Request) {
  const key = await authenticateApiKey(request, "events:read");
  if (!key) return NextResponse.json({ ok: false, error: "Invalid key or missing events:read scope" }, { status: 401 });
  try {
    const { applicationId } = query.parse(Object.fromEntries(new URL(request.url).searchParams)); const sql = requireSql();
    const [application] = await sql`select id from applications where id=${applicationId} and project_id=${key.projectId}`;
    if (!application) return NextResponse.json({ ok: false, error: "Application not found" }, { status: 404 });
    const contracts = await sql`select et.name, et.description, ec.version, ec.schema, ec.example from event_types et join lateral (select version,schema,example from event_contract_versions where event_type_id=et.id and status='published' order by version desc limit 1) ec on true where et.project_id=${key.projectId} and (et.application_id=${applicationId} or et.application_id is null) order by et.name`;
    return NextResponse.json({ ok: true, applicationId, contracts }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Invalid contract query" }, { status: 400 }); }
}
