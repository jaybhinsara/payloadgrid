import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [schema, migration, auth, limits, outbound, messages, batch, inbound] = await Promise.all([
  read("../db/schema.sql"),
  read("../db/migrations/20260820_ingestion_hot_path.sql"),
  read("../src/lib/api-auth.ts"),
  read("../src/lib/limits.ts"),
  read("../src/lib/outbound.ts"),
  read("../src/app/api/v1/messages/route.ts"),
  read("../src/app/api/v1/messages/batch/route.ts"),
  read("../src/app/in/[endpointId]/route.ts")
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

test("outbound acceptance loads application transforms and contract in one query", () => {
  assert.match(outbound, /select jsonb_agg\(t\.config order by t\.created_at asc\)/);
  assert.match(outbound, /left join lateral/);
  assert.match(outbound, /validateContractPayload/);
  assert.doesNotMatch(outbound, /select config from transformations/);
  assert.match(outbound, /with accepted_message as/);
  assert.match(outbound, /insert into dispatch_jobs/);
});
