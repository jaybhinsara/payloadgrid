import { requireSql } from "@/lib/db";
import { queueConfigured } from "@/lib/queue";

export type SystemHealth = {
  status: "operational" | "degraded";
  database: "operational";
  deliveryQueue: "operational" | "fallback";
  pendingDeliveries: number;
  oldestPendingSeconds: number;
  pendingDispatchJobs: number;
  publishingDispatchJobs: number;
  dispatchErrors: number;
  oldestDispatchSeconds: number;
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
        coalesce(extract(epoch from (now() - min(case
          when e.status in ('queued','processing','received') then e.updated_at
          when e.status = 'retrying' and coalesce(e.next_retry_at, e.updated_at) <= now() then coalesce(e.next_retry_at, e.updated_at)
        end))), 0)::int as oldest_pending_seconds,
        max(e.updated_at) filter (where e.status in ('delivered','failed','dead_letter','cancelled')) as last_delivery_at
      from webhook_events e join endpoints ep on ep.id = e.endpoint_id
      where ep.project_id = ${projectId}
    `;
    return row;
  }
  const [row] = await sql`
    select count(*) filter (where status in ('queued','processing','retrying','received'))::int as pending,
      coalesce(extract(epoch from (now() - min(case
        when status in ('queued','processing','received') then updated_at
        when status = 'retrying' and coalesce(next_retry_at, updated_at) <= now() then coalesce(next_retry_at, updated_at)
      end))), 0)::int as oldest_pending_seconds,
      max(updated_at) filter (where status in ('delivered','failed','dead_letter','cancelled')) as last_delivery_at
    from webhook_events
  `;
  return row;
}

async function readOutboxMetrics(projectId?: string) {
  const sql = requireSql();
  if (projectId) {
    const [row] = await sql`
      select count(*) filter (where j.status = 'pending')::int as pending,
        count(*) filter (where j.status = 'publishing')::int as publishing,
        count(*) filter (where j.last_error is not null
          and j.last_error <> 'Endpoint delivery rate limit deferred this event'
          and j.updated_at >= now() - interval '1 hour')::int as errors,
        coalesce(extract(epoch from (now() - min(case
          when j.status = 'pending' and j.available_at <= now() then j.available_at
          when j.status = 'publishing' then coalesce(j.locked_at, j.updated_at)
        end))), 0)::int as oldest_seconds
      from dispatch_jobs j
      join webhook_events e on e.id = j.event_id
      join endpoints ep on ep.id = e.endpoint_id
      where ep.project_id = ${projectId}
    `;
    return row;
  }
  const [row] = await sql`
    select count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'publishing')::int as publishing,
      count(*) filter (where last_error is not null
        and last_error <> 'Endpoint delivery rate limit deferred this event'
        and updated_at >= now() - interval '1 hour')::int as errors,
      coalesce(extract(epoch from (now() - min(case
        when status = 'pending' and available_at <= now() then available_at
        when status = 'publishing' then coalesce(locked_at, updated_at)
      end))), 0)::int as oldest_seconds
    from dispatch_jobs
  `;
  return row;
}

export async function readSystemHealth(projectId?: string): Promise<SystemHealth> {
  const row = await readQueueMetrics(projectId);
  const outbox = await readOutboxMetrics(projectId);
  const configured = queueConfigured();
  const oldest = Number(row.oldest_pending_seconds || 0);
  const oldestDispatch = Number(outbox.oldest_seconds || 0);
  return {
    status: configured && oldest < 300 && oldestDispatch < 300 ? "operational" : "degraded",
    database: "operational",
    deliveryQueue: configured ? "operational" : "fallback",
    pendingDeliveries: Number(row.pending || 0),
    oldestPendingSeconds: oldest,
    pendingDispatchJobs: Number(outbox.pending || 0),
    publishingDispatchJobs: Number(outbox.publishing || 0),
    dispatchErrors: Number(outbox.errors || 0),
    oldestDispatchSeconds: oldestDispatch,
    lastDeliveryAt: row.last_delivery_at ? new Date(String(row.last_delivery_at)).toISOString() : null,
    checkedAt: new Date().toISOString()
  };
}

export async function readPublicHealth(): Promise<PublicHealth> {
  const health = await readSystemHealth();
  const deliveryState: ServiceState = health.oldestPendingSeconds >= 300 || health.oldestDispatchSeconds >= 300 ? "degraded" : "operational";
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
