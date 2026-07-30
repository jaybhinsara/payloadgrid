import { requireSql } from "@/lib/db";

export async function writeAudit(organizationId: string, userId: string | null, action: string, resourceType: string, resourceId?: string, metadata: Record<string, unknown> = {}) {
  const sql = requireSql();
  await sql`
    insert into audit_logs (organization_id, user_id, action, resource_type, resource_id, metadata)
    values (${organizationId}, ${userId}, ${action}, ${resourceType}, ${resourceId || null}, ${JSON.stringify(metadata)}::jsonb)
  `;
}