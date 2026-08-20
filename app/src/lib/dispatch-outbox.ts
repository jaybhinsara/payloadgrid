import { requireSql } from "@/lib/db";
import { enqueueDelivery, queueConfigured, queueErrorMessage } from "@/lib/queue";

type DispatchJob = {
  id: string;
  event_id: string;
  endpoint_id: string;
  workspace_id: string;
  workspace_rate_limit_per_minute: number | string;
  workspace_parallelism: number | string;
  delivery_attempt: number | string;
  next_retry_at: string | null;
};

type DispatchResult = {
  eventId: string;
  published: boolean;
  mode?: "qstash" | "direct";
  deferred?: boolean;
  error?: string;
  result?: unknown;
};

export type DispatchBatchResult = {
  claimed: number;
  published: number;
  deferred: number;
  failed: number;
  results: DispatchResult[];
};

export async function scheduleDispatch(eventId: string, availableAt = new Date()) {
  const sql = requireSql();
  await sql`
    insert into dispatch_jobs (event_id, status, available_at, last_error, locked_at, published_at, updated_at)
    values (${eventId}, 'pending', ${availableAt.toISOString()}, null, null, null, now())
    on conflict (event_id) do update set
      status = 'pending', available_at = excluded.available_at, last_error = null,
      locked_at = null, qstash_message_id = null, published_at = null, updated_at = now()
  `;
}

async function claimDispatchJobs(limit: number, eventId?: string) {
  const sql = requireSql();
  const rows = await sql`
    with eligible as (
      select j.id, j.available_at, j.created_at, e.endpoint_id, p.organization_id as workspace_id,
        o.delivery_rate_per_minute as workspace_rate_limit_per_minute,
        o.delivery_parallelism as workspace_parallelism,
        e.next_retry_at,
        row_number() over (partition by p.organization_id order by j.available_at, j.created_at) as workspace_rank
      from dispatch_jobs j
      join webhook_events e on e.id=j.event_id
      join endpoints ep on ep.id=e.endpoint_id
      join projects p on p.id=ep.project_id
      join organizations o on o.id=p.organization_id
      where (${eventId || null}::uuid is null or j.event_id = ${eventId || null}::uuid)
        and ((j.status='pending' and j.available_at <= now())
          or (j.status='publishing' and j.locked_at < now() - interval '2 minutes'))
        and o.suspended_at is null and o.delivery_paused_at is null
        and ep.is_active=true and ep.deleted_at is null
    ), candidates as (
      select j.id, eligible.endpoint_id, eligible.workspace_id,
        eligible.workspace_rate_limit_per_minute, eligible.workspace_parallelism, eligible.next_retry_at
      from dispatch_jobs j join eligible on eligible.id=j.id
      order by eligible.workspace_rank, eligible.available_at, eligible.created_at
      for update skip locked
      limit ${limit}
    )
    update dispatch_jobs j set status = 'publishing', locked_at = now(),
      publish_attempts = publish_attempts + 1, updated_at = now()
    from candidates c
    where j.id = c.id
    returning j.id, j.event_id, c.endpoint_id, c.workspace_id,
      c.workspace_rate_limit_per_minute, c.workspace_parallelism,
      (select count(*) + 1 from delivery_attempts where event_id = j.event_id) as delivery_attempt,
      c.next_retry_at
  `;
  return rows as unknown as DispatchJob[];
}

function retryAt(attempts: number) {
  const seconds = Math.min(300, Math.max(2, 2 ** Math.min(attempts, 8)));
  return new Date(Date.now() + seconds * 1000);
}

export async function dispatchOutboxBatch(limit = 25, eventId?: string): Promise<DispatchBatchResult> {
  const sql = requireSql();
  const jobs = await claimDispatchJobs(Math.min(Math.max(limit, 1), 100), eventId);
  const results: DispatchResult[] = await Promise.all(jobs.map(async (job): Promise<DispatchResult> => {
    try {
      if (queueConfigured()) {
        const delaySeconds = job.next_retry_at
          ? Math.max(0, Math.ceil((new Date(job.next_retry_at).getTime() - Date.now()) / 1000))
          : 0;
        const result = await enqueueDelivery({
          eventId: String(job.event_id), endpointId: String(job.endpoint_id), workspaceId: String(job.workspace_id),
          attempt: Number(job.delivery_attempt || 1),
          workspaceRateLimitPerMinute: Number(job.workspace_rate_limit_per_minute || 600),
          workspaceParallelism: Number(job.workspace_parallelism || 10),
          delaySeconds, deduplicationId: `${job.event_id}-dispatch-${job.id}-${job.delivery_attempt}`
        });
        if (!result.queued) throw new Error(result.reason);
        await sql`
          update dispatch_jobs set status = 'published', qstash_message_id = ${result.messageId},
            last_error = null, locked_at = null, published_at = now(), updated_at = now()
          where id = ${job.id} and status = 'publishing'
        `;
        return { eventId: String(job.event_id), published: true, mode: "qstash" as const };
      }

      if (job.next_retry_at && new Date(job.next_retry_at).getTime() > Date.now()) {
        await sql`
          update dispatch_jobs set status = 'pending', available_at = ${job.next_retry_at},
            locked_at = null, updated_at = now() where id = ${job.id} and status = 'publishing'
        `;
        return { eventId: String(job.event_id), published: false, deferred: true };
      }
      const { processDelivery } = await import("@/lib/delivery-worker");
      const result: unknown = await processDelivery(String(job.event_id));
      await sql`
        update dispatch_jobs set status = 'published', last_error = null, locked_at = null,
          published_at = now(), updated_at = now() where id = ${job.id} and status = 'publishing'
      `;
      return { eventId: String(job.event_id), published: true, mode: "direct" as const, result };
    } catch (error) {
      const message = queueErrorMessage(error);
      const [current] = await sql`select publish_attempts from dispatch_jobs where id = ${job.id}`;
      await sql`
        update dispatch_jobs set status = 'pending', available_at = ${retryAt(Number(current?.publish_attempts || 1)).toISOString()},
          last_error = ${message}, locked_at = null, updated_at = now() where id = ${job.id} and status = 'publishing'
      `;
      return { eventId: String(job.event_id), published: false, error: message };
    }
  }));
  return {
    claimed: jobs.length,
    published: results.filter((item) => item.published).length,
    deferred: results.filter((item) => "deferred" in item && item.deferred).length,
    failed: results.filter((item) => !item.published && !("deferred" in item && item.deferred)).length,
    results
  };
}

export async function recoverMissingDispatchJobs(limit = 100) {
  const sql = requireSql();
  const stale = await sql`
    update dispatch_jobs j set status = 'pending', available_at = now(),
      qstash_message_id = null, last_error = 'Published job exceeded its delivery acknowledgement window',
      locked_at = null, published_at = null, updated_at = now()
    from webhook_events e
    where e.id = j.event_id and j.status = 'published'
      and j.published_at < now() - interval '15 minutes'
      and e.status in ('queued', 'received', 'retrying')
      and (e.next_retry_at is null or e.next_retry_at <= now() - interval '15 minutes')
      and not exists (
        select 1 from delivery_attempts a
        where a.event_id = e.id and a.created_at >= j.published_at
      )
    returning j.event_id
  `;
  const rows = await sql`
    insert into dispatch_jobs (event_id, status, available_at)
    select e.id, 'pending', coalesce(e.next_retry_at, now())
    from webhook_events e
    left join dispatch_jobs j on j.event_id = e.id
    where j.id is null and e.status in ('queued', 'received', 'retrying')
      and (e.next_retry_at is null or e.next_retry_at <= now())
      and exists (
        select 1 from endpoints ep join projects p on p.id=ep.project_id
        join organizations o on o.id=p.organization_id
        where ep.id=e.endpoint_id and o.suspended_at is null and o.delivery_paused_at is null
      )
    order by coalesce(e.next_retry_at, e.received_at) asc
    limit ${Math.min(Math.max(limit, 1), 500)}
    on conflict (event_id) do nothing
    returning event_id
  `;
  return rows.length + stale.length;
}
