import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [schema, migration, rateMigration, auth, limits, outbound, messages, batch, inbound, circuit, maintenance, burst, runner] = await Promise.all([
  read("../db/schema.sql"),
  read("../db/migrations/20260820_ingestion_hot_path.sql"),
  read("../db/migrations/20260820_sharded_rate_counters.sql"),
  read("../src/lib/api-auth.ts"),
  read("../src/lib/limits.ts"),
  read("../src/lib/outbound.ts"),
  read("../src/app/api/v1/messages/route.ts"),
  read("../src/app/api/v1/messages/batch/route.ts"),
  read("../src/app/in/[endpointId]/route.ts"),
  read("../src/lib/circuit-breaker.ts"),
  read("../src/app/api/cron/maintenance/route.ts"),
  read("../load/k6/burst.js"),
  read("../load/run.ps1")
]);

test("monthly quota enforcement uses bounded exact usage buckets", () => {
  for (const source of [schema, migration]) {
    assert.match(source, /create table if not exists organization_usage_month_buckets/);
    assert.match(source, /bucket between 0 and 15/);
    assert.match(source, /messages_usage_bucket_trigger/);
    assert.match(source, /webhook_events_usage_bucket_trigger/);
    assert.match(source, /after insert on messages/);
    assert.match(source, /after insert on webhook_events/);
    assert.match(source, /is_simulation/);
    assert.match(source, /p\.organization_id is not null/);
    assert.match(source, /e\.direction = 'inbound'/);
    assert.match(source, /e\.is_simulation = false/);
  }
  assert.match(limits, /sum\(outbound_events \+ inbound_events\)/);
  assert.doesNotMatch(limits, /select count\(\*\) from messages/);
  assert.doesNotMatch(limits, /select count\(\*\) from webhook_events/);
  assert.match(outbound, /validation_warnings, is_simulation/);
});

test("authenticated API limits are reused and key activity writes are throttled", () => {
  assert.match(auth, /LAST_USED_WRITE_INTERVAL_MS = 5 \* 60 \* 1000/);
  assert.match(auth, /MAX_TRACKED_KEYS = 5_000/);
  assert.match(auth, /after\(async \(\) =>/);
  assert.match(auth, /apiRequestsPerMinute: limits\.apiRequestsPerMinute/);
  assert.match(auth, /messagesPerMonth:/);
  assert.match(messages, /key\.apiRequestsPerMinute/);
  assert.match(messages, /organizationId: key\.organizationId/);
  assert.match(batch, /key\.messagesPerMonth/);
  assert.match(inbound, /limits\.inboundRequestsPerMinute/);
});

test("per-minute rate counters are sharded without removing plan enforcement", () => {
  for (const source of [schema, rateMigration]) {
    assert.match(source, /create table if not exists api_usage_window_buckets/);
    assert.match(source, /create table if not exists endpoint_usage_window_buckets/);
    assert.match(source, /bucket between 0 and 15/);
  }
  assert.match(limits, /randomInt\(RATE_COUNTER_BUCKETS\)/);
  assert.match(limits, /api_usage_window_buckets/);
  assert.match(limits, /endpoint_usage_window_buckets/);
  assert.match(limits, /other\.bucket <> incremented\.bucket/);
  assert.match(limits, /retryAfterSeconds/);
  assert.doesNotMatch(limits, /insert into api_usage_windows/);
  assert.doesNotMatch(limits, /insert into endpoint_usage_windows/);
  assert.match(circuit, /with minute_totals as/);
  assert.match(maintenance, /delete from api_usage_window_buckets/);
  assert.match(maintenance, /delete from endpoint_usage_window_buckets/);
  assert.match(messages, /usageLimitHeaders\(error\)/);
  assert.match(batch, /usageLimitHeaders\(error\)/);
  assert.match(inbound, /usageLimitHeaders\(error\)/);
  assert.match(burst, /Burst server error/);
  assert.match(burst, /retry-after=/);
  assert.match(runner, /"starter-burst"/);
});

test("outbound acceptance loads application transforms and contract in one query", () => {
  assert.match(outbound, /select jsonb_agg\(t\.config order by t\.created_at asc\)/);
  assert.match(outbound, /left join lateral/);
  assert.match(outbound, /validateContractPayload/);
  assert.doesNotMatch(outbound, /select config from transformations/);
  assert.match(outbound, /with accepted_message as/);
  assert.match(outbound, /insert into dispatch_jobs/);
});
