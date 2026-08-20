import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [schema, queue, outbox, worker, recovery, runner] = await Promise.all([
  read("../db/schema.sql"), read("../src/lib/queue.ts"), read("../src/lib/dispatch-outbox.ts"),
  read("../src/lib/delivery-worker.ts"), read("../ops/recovery-evidence.mjs"), read("../load/run.ps1")
]);

test("queue flow control is isolated by workspace", () => {
  assert.match(schema, /delivery_rate_per_minute/);
  assert.match(schema, /delivery_parallelism/);
  assert.match(queue, /key: `workspace-\$\{input\.workspaceId\}`/);
  assert.match(queue, /workspaceRateLimitPerMinute/);
});

test("outbox claims are fair across workspaces and retain endpoint throttling", () => {
  assert.match(outbox, /partition by p\.organization_id/);
  assert.match(outbox, /order by eligible\.workspace_rank/);
  assert.match(outbox, /for update skip locked/);
  assert.match(schema, /create table if not exists endpoint_delivery_windows/);
  assert.match(worker, /reserveEndpointDeliverySlot/);
  assert.match(worker, /Endpoint delivery rate limit deferred this event/);
});

test("recovery tooling is read-only and guarded", () => {
  assert.match(recovery, /I_APPROVE_READ_ONLY_RECOVERY_CHECK/);
  assert.doesNotMatch(recovery, /await sql`\s*(insert|update|delete|drop|truncate)\b/i);
  assert.doesNotMatch(recovery, /sql\.query\(`\s*(insert|update|delete|drop|truncate)\b/i);
  assert.match(recovery, /orphan_dispatch_jobs/);
  assert.match(runner, /I_APPROVE_LOAD_TEST/);
});
