import { requireSql } from "@/lib/db";

export async function writePlatformAudit(actorId: string, action: string, resourceType: string, resourceId: string | null, detail: Record<string, unknown> = {}) {
  const sql = requireSql();
  await sql`
    insert into platform_audit_logs (actor_id, action, resource_type, resource_id, detail)
    values (${actorId}, ${action}, ${resourceType}, ${resourceId}, ${JSON.stringify(detail)}::jsonb)
  `;
}
