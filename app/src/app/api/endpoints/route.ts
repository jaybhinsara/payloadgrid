import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSql } from "@/lib/db";

export const runtime = "nodejs";

const endpointSchema = z.object({
  name: z.string().min(2).max(80),
  provider: z.enum(["razorpay", "stripe", "cashfree", "shopify", "custom"]),
  destinationUrl: z.string().url().max(500)
});

async function ensureDefaultProject() {
  const sql = requireSql();
  const name = process.env.HOOKIN_DEFAULT_PROJECT_NAME || "HookIn Workspace";
  const existing = await sql`select id from projects where slug = 'default' limit 1`;
  if (existing.length) return existing[0];
  const created = await sql`insert into projects (name, slug) values (${name}, 'default') returning id`;
  return created[0];
}

export async function POST(request: Request) {
  try {
    const sql = requireSql();
    const body = endpointSchema.parse(await request.json());
    const project = await ensureDefaultProject();
    const [endpoint] = await sql`
      insert into endpoints (project_id, name, provider, destination_url)
      values (${project.id}, ${body.name}, ${body.provider}, ${body.destinationUrl})
      returning id, name, provider, destination_url, is_active, created_at
    `;
    return NextResponse.json({ ok: true, endpoint }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Endpoint creation failed" }, { status: 400 });
  }
}
