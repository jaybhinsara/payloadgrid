import { requireSql } from "@/lib/db";
import { queueConfigured } from "@/lib/queue";

export type SystemHealth = {
  status: "operational" | "degraded";
  database: "operational";
  deliveryQueue: "operational" | "fallback";
  pendingDeliveries: number;
  oldestPendingSeconds: number;
  lastDeliveryAt: string | null;
  checkedAt: string;
};

export async function readSystemHealth(): Promise<SystemHealth> {
  const sql = requireSql();
  const [row] = await sql`
    select count(*) filter (where status in ('queued','processing','retrying'))::int as pending,
      coalesce(extract(epoch from (now() - (min(received_at) filter (where status in ('queued','processing','retrying'))))), 0)::int as oldest_pending_seconds,
      max(updated_at) filter (where status in ('delivered','failed')) as last_delivery_at
    from webhook_events
  `;
  const configured = queueConfigured();
  const oldest = Number(row.oldest_pending_seconds || 0);
  return {
    status: configured && oldest < 300 ? "operational" : "degraded",
    database: "operational",
    deliveryQueue: configured ? "operational" : "fallback",
    pendingDeliveries: Number(row.pending || 0),
    oldestPendingSeconds: oldest,
    lastDeliveryAt: row.last_delivery_at ? new Date(String(row.last_delivery_at)).toISOString() : null,
    checkedAt: new Date().toISOString()
  };
}