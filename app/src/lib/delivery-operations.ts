import { requireSql } from "@/lib/db";
import { enqueueDelivery, queueErrorMessage } from "@/lib/queue";
import { randomToken } from "@/lib/security";

export type ReplayTarget = {
  id: string;
  endpoint_id: string;
  attempt_count: number | string;
  rate_limit_per_minute: number | string;
};

export async function scheduleReplay(target: ReplayTarget) {
  const sql = requireSql();
  const attempt = Number(target.attempt_count || 0) + 1;
  await sql`
    update webhook_events set status = 'queued', locked_at = null, next_retry_at = null,
      cancelled_at = null, dead_lettered_at = null, resolved_at = null, resolved_by = null, resolution_note = null,
      max_retries = greatest(max_retries, ${attempt + 1}), updated_at = now()
    where id = ${target.id}
  `;

  let scheduled = false;
  let queueError: string | null = null;
  try {
    const queued = await enqueueDelivery({
      eventId: String(target.id), endpointId: String(target.endpoint_id), attempt,
      rateLimitPerMinute: Number(target.rate_limit_per_minute),
      deduplicationId: `${target.id}-replay-${randomToken(8)}`
    });
    scheduled = queued.queued;
    if (!queued.queued) queueError = queued.reason;
  } catch (error) {
    queueError = queueErrorMessage(error);
  }
  return { eventId: String(target.id), attempt, scheduled, queueError };
}
