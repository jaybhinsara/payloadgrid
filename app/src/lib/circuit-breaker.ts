import { deliverAlert } from "@/lib/alerts";
import { requireSql } from "@/lib/db";

type CircuitEndpoint = {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  threshold: number;
  state: string;
};

export async function evaluateCircuitBreaker(endpoint: CircuitEndpoint) {
  if (!endpoint.enabled || endpoint.state === "open") return { open: endpoint.state === "open", newlyOpened: false };
  const sql = requireSql();
  const [sample] = await sql`
    select
      coalesce((select request_count from endpoint_usage_windows where endpoint_id = ${endpoint.id}
        and window_start = date_trunc('minute', now())), 0)::int as current_count,
      coalesce(avg(request_count), 0)::numeric as baseline_average,
      coalesce(stddev_pop(request_count), 0)::numeric as baseline_deviation
    from endpoint_usage_windows
    where endpoint_id = ${endpoint.id}
      and window_start >= date_trunc('minute', now()) - interval '30 minutes'
      and window_start < date_trunc('minute', now())
  `;
  const current = Number(sample.current_count || 0);
  const average = Number(sample.baseline_average || 0);
  const deviation = Number(sample.baseline_deviation || 0);
  const anomalyFloor = Math.max(endpoint.threshold, Math.ceil(average + Math.max(3 * deviation, 10)));
  if (current < anomalyFloor) return { open: false, newlyOpened: false };

  const [opened] = await sql`
    update endpoints set circuit_state = 'open', circuit_opened_at = now(), updated_at = now()
    where id = ${endpoint.id} and circuit_state = 'closed'
    returning id
  `;
  if (!opened) return { open: true, newlyOpened: false };
  await sql`
    insert into circuit_breaker_events (endpoint_id, state, observed_count, baseline_average, baseline_deviation, reason)
    values (${endpoint.id}, 'opened', ${current}, ${average}, ${deviation}, ${`Traffic reached ${current} requests/minute; anomaly threshold was ${anomalyFloor}`})
  `;
  return { open: true, newlyOpened: true, current, average, deviation, anomalyFloor };
}

export async function notifyCircuitOpened(endpoint: CircuitEndpoint, observedCount: number) {
  const sql = requireSql();
  const rules = await sql`select name, channel, destination from alert_rules where project_id = ${endpoint.projectId} and is_active = true`;
  for (const rule of rules) {
    try {
      await deliverAlert(rule, {
        source: "PayloadGrid",
        alert: String(rule.name),
        eventId: endpoint.id,
        eventType: "circuit_breaker.opened",
        error: `${endpoint.name} was paused after ${observedCount} requests in one minute`,
        failuresInWindow: observedCount,
        occurredAt: new Date().toISOString()
      });
    } catch { /* Circuit state is durable even if an alert destination is unavailable. */ }
  }
}
