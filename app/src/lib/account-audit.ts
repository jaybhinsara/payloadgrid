import { requireSql } from "@/lib/db";

export async function writeAccountAudit(userId: string, action: string, metadata: Record<string, unknown> = {}) {
  const sql = requireSql();
  await sql`
    insert into account_audit_logs (user_id, action, metadata)
    values (${userId}, ${action}, ${JSON.stringify(metadata)}::jsonb)
  `;
}
