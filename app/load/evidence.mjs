import { neon } from "@neondatabase/serverless";
import { writeFile } from "node:fs/promises";

const databaseUrl = process.env.LOAD_EVIDENCE_DATABASE_URL;
const runId = process.env.LOAD_RUN_ID;
const output = process.env.LOAD_EVIDENCE_FILE;
if (!databaseUrl || !runId || !output) throw new Error("LOAD_EVIDENCE_DATABASE_URL, LOAD_RUN_ID, and LOAD_EVIDENCE_FILE are required.");

const sql = neon(databaseUrl);
const [summary] = await sql`
  with run_events as (
    select * from webhook_events e
    where e.request_body->>'loadRunId'=${runId} or e.request_body#>>'{data,loadRunId}'=${runId}
  ), event_summary as (
    select count(*)::int as deliveries,
      count(*) filter (where status='delivered')::int as delivered,
      count(*) filter (where status='retrying')::int as retrying,
      count(*) filter (where status='dead_letter')::int as dead_letter,
      count(*) filter (where status in ('queued','received','processing','buffered'))::int as pending,
      count(*) filter (where status='cancelled')::int as cancelled,
      min(received_at) as first_received_at, max(updated_at) as last_updated_at
    from run_events
  ), attempt_summary as (
    select coalesce(avg(a.latency_ms), 0)::numeric(12,2) as average_destination_latency_ms,
      coalesce(percentile_cont(0.95) within group (order by a.latency_ms), 0)::numeric(12,2) as p95_destination_latency_ms,
      count(a.id)::int as attempts
    from delivery_attempts a join run_events e on e.id=a.event_id
  ) select * from event_summary cross join attempt_summary
`;
const duplicateAttempts = await sql`
  select count(*)::int as duplicate_attempt_numbers from (
    select event_id, attempt_number from delivery_attempts a join webhook_events e on e.id=a.event_id
    where e.request_body->>'loadRunId'=${runId} or e.request_body#>>'{data,loadRunId}'=${runId}
    group by event_id, attempt_number having count(*) > 1
  ) duplicates
`;
const tenantBreakdown = await sql`
  with run_events as (
    select e.*,
      coalesce(e.request_body->>'tenantRole', e.request_body#>>'{data,tenantRole}', 'unspecified') as tenant_role
    from webhook_events e
    where e.request_body->>'loadRunId'=${runId} or e.request_body#>>'{data,loadRunId}'=${runId}
  )
  select tenant_role,
    count(*)::int as deliveries,
    count(*) filter (where status='delivered')::int as delivered,
    count(*) filter (where status='retrying')::int as retrying,
    count(*) filter (where status='dead_letter')::int as dead_letter,
    count(*) filter (where status in ('queued','received','processing','buffered'))::int as pending,
    count(*) filter (where status='cancelled')::int as cancelled,
    coalesce(avg(extract(epoch from (updated_at - received_at)) * 1000), 0)::numeric(12,2) as average_lifecycle_ms,
    coalesce(percentile_cont(0.95) within group (order by extract(epoch from (updated_at - received_at)) * 1000), 0)::numeric(12,2) as p95_lifecycle_ms
  from run_events
  group by tenant_role
  order by tenant_role
`;
const evidence = {
  runId,
  recordedAt: new Date().toISOString(),
  ...summary,
  duplicateAttemptNumbers: Number(duplicateAttempts[0]?.duplicate_attempt_numbers || 0),
  tenantBreakdown
};
await writeFile(output, `${JSON.stringify(evidence, null, 2)}\n`, { flag: "wx" });
console.log(JSON.stringify(evidence, null, 2));
