import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [schema, searchRoute, deliveryRoute, workspaceRoute, consoleSource, supportSource, limits, worker, outbox] = await Promise.all([
  read("../db/schema.sql"), read("../src/app/api/admin/support/deliveries/route.ts"),
  read("../src/app/api/admin/support/deliveries/[eventId]/route.ts"),
  read("../src/app/api/admin/support/workspaces/[workspaceId]/route.ts"),
  read("../src/components/admin/admin-console.tsx"), read("../src/components/admin/admin-support.tsx"),
  read("../src/lib/limits.ts"), read("../src/lib/delivery-worker.ts"), read("../src/lib/dispatch-outbox.ts")
]);

test("support schema is additive and preserves an authored note history", () => {
  assert.match(schema, /alter table organizations add column if not exists delivery_paused_at timestamptz/);
  assert.match(schema, /temporary_message_limit integer/);
  assert.match(schema, /temporary_limit_expires_at timestamptz/);
  assert.match(schema, /create table if not exists workspace_support_notes/);
  assert.match(schema, /author_id uuid references users\(id\) on delete set null/);
  assert.match(schema, /support_archived_at timestamptz/);
});

test("cross-workspace support search is Admin-only and does not expose stored payloads", () => {
  assert.match(searchRoute, /requirePlatformAdmin\(context\)/);
  assert.match(searchRoute, /workspaceId: z\.string\(\)\.uuid\(\)/);
  assert.match(searchRoute, /e\.provider_event_id/);
  assert.doesNotMatch(searchRoute, /e\.request_body|e\.request_headers|response_body/);
  assert.match(deliveryRoute, /requirePlatformAdmin\(context\)/);
  assert.doesNotMatch(deliveryRoute, /select[^;]*request_body|select[^;]*request_headers/i);
  assert.match(deliveryRoute, /safeDestination/);
  assert.match(deliveryRoute, /url\.protocol.*url\.host.*url\.pathname/);
});

test("support delivery recovery requires reasons and writes both audit histories", () => {
  assert.match(deliveryRoute, /reason: z\.string\(\)\.trim\(\)\.min\(3\)/);
  assert.match(deliveryRoute, /z\.enum\(\["retry", "cancel", "dead_letter", "resolve", "archive"\]\)/);
  assert.match(deliveryRoute, /scheduleReplay/);
  assert.match(deliveryRoute, /writePlatformAudit/);
  assert.match(deliveryRoute, /writeAudit/);
  assert.match(deliveryRoute, /support\.delivery\.\$\{body\.action\}/);
  assert.match(deliveryRoute, /support_archived_at=now\(\)/);
});

test("workspace delivery pause is enforced in every dispatch worker", () => {
  assert.match(worker, /o\.delivery_paused_at is null/);
  assert.match(outbox, /o\.delivery_paused_at is null/);
  assert.match(workspaceRoute, /action: z\.literal\("pause"\)/);
  assert.match(workspaceRoute, /action: z\.literal\("resume"\)/);
  assert.match(workspaceRoute, /insert into dispatch_jobs/);
  assert.match(workspaceRoute, /on conflict \(event_id\) do update/);
});

test("temporary capacity is bounded, expiring, and used by monthly enforcement", () => {
  assert.match(workspaceRoute, /action: z\.literal\("set_capacity"\)/);
  assert.match(workspaceRoute, /within the next 90 days/);
  assert.match(workspaceRoute, /Temporary capacity cannot be below/);
  assert.match(limits, /temporary_limit_expires_at > now\(\)/);
  assert.match(limits, /account\?\.temporary_message_limit/);
});

test("Admin exposes a dedicated support workflow and safe operational controls", () => {
  assert.match(consoleSource, /Support operations/);
  assert.match(consoleSource, /<AdminSupport workspaces=/);
  assert.match(supportSource, /Payload contents are intentionally unavailable here/);
  assert.match(supportSource, /Required audit reason/);
  assert.match(supportSource, /Internal support note/);
  assert.match(supportSource, /Temporary monthly capacity/);
  assert.match(supportSource, /Move to dead letter/);
  assert.match(supportSource, /Monthly usage/);
  assert.match(supportSource, /label: "Archive"/);
});
