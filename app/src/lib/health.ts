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

export type ServiceState = "operational" | "degraded" | "outage";
export type PublicHealth = {
  status: ServiceState;
  services: {
    api: ServiceState;
    dashboard: ServiceState;
    inboundWebhooks: ServiceState;
    outboundDelivery: ServiceState;
    scheduledRetries: ServiceState;
  };
  checkedAt: string;
};

async function readQueueMetrics(projectId?: string) {
  const sql = requireSql();
  if (projectId) {
    const [row] = await sql`
      select count(*) filter (where e.status in ('queued','processing','retrying','received'))::int as pending,
        coalesce(extract(epoch from (now() - (min(e.received_at) filter (where e.status in ('queued','processing','retrying','received'))))), 0)::int as oldest_pending_seconds,
        max(e.updated_at) filter (where e.status in ('delivered','failed','dead_letter','cancelled')) as last_delivery_at
      from webhook_events e join endpoints ep on ep.id = e.endpoint_id
      where ep.project_id = ${projectId}
    `;
    return row;
  }
  const [row] = await sql`
    select count(*) filter (where status in ('queued','processing','retrying','received'))::int as pending,
      coalesce(extract(epoch from (now() - (min(received_at) filter (where status in ('queued','processing','retrying','received'))))), 0)::int as oldest_pending_seconds,
      max(updated_at) filter (where status in ('delivered','failed','dead_letter','cancelled')) as last_delivery_at
    from webhook_events
  `;
  return row;
}

export async function readSystemHealth(projectId?: string): Promise<SystemHealth> {
  const row = await readQueueMetrics(projectId);
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

export async function readPublicHealth(): Promise<PublicHealth> {
  const health = await readSystemHealth();
  const deliveryState: ServiceState = health.oldestPendingSeconds >= 300 ? "degraded" : "operational";
  return {
    status: deliveryState,
    services: {
      api: "operational",
      dashboard: "operational",
      inboundWebhooks: "operational",
      outboundDelivery: deliveryState,
      scheduledRetries: deliveryState
    },
    checkedAt: health.checkedAt
  };
}
