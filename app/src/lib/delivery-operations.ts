import { requireSql } from "@/lib/db";

export type ReplayTarget = {
  id: string;
  endpoint_id: string;
  attempt_count: number | string;
  rate_limit_per_minute: number | string;
};

export async function scheduleReplay(target: ReplayTarget, options: { availableAt?: Date; batchId?: string } = {}) {
  const sql = requireSql();
  const attempt = Number(target.attempt_count || 0) + 1;
  const [result] = await sql`
    with replayed as (
      update webhook_events set status = 'queued', locked_at = null, next_retry_at = null,
        cancelled_at = null, dead_lettered_at = null, resolved_at = null, resolved_by = null, resolution_note = null,
        max_retries = greatest(max_retries, ${attempt + 1}), updated_at = now()
      where id = ${target.id}
      returning id
    ), scheduled as (
      insert into dispatch_jobs (event_id, status, available_at, last_error, locked_at, qstash_message_id, published_at, updated_at, replay_batch_id)
      select id, 'pending', ${options.availableAt || new Date()}, null, null, null, null, now(), ${options.batchId || null} from replayed
      on conflict (event_id) do update set status = 'pending', available_at = excluded.available_at, last_error = null,
        locked_at = null, qstash_message_id = null, published_at = null, updated_at = now(), replay_batch_id = excluded.replay_batch_id
      returning event_id
    )
    select event_id from scheduled
  `;
  return { eventId: String(target.id), attempt, scheduled: Boolean(result), queueError: null };
}
