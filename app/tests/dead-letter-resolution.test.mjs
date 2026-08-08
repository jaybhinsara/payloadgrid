import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resolveRoute = await readFile(new URL("../src/app/api/events/[eventId]/resolve/route.ts", import.meta.url), "utf8");
const deliveriesRoute = await readFile(new URL("../src/app/api/deliveries/route.ts", import.meta.url), "utf8");
const replay = await readFile(new URL("../src/lib/delivery-operations.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/app/api/dashboard/route.ts", import.meta.url), "utf8");

test("manual dead-letter resolution is role and project scoped", () => {
  assert.match(resolveRoute, /requireRole\(context, \["owner", "admin", "developer"\]\)/);
  assert.match(resolveRoute, /ep\.project_id = \$\{context\.project\.id\}/);
  assert.match(resolveRoute, /e\.status = 'dead_letter' and e\.resolved_at is null/);
});

test("resolved deliveries remain in history but leave the active dead-letter filter", () => {
  assert.match(deliveriesRoute, /input\.status === "resolved"/);
  assert.match(deliveriesRoute, /input\.status === "dead_letter"/);
  assert.match(deliveriesRoute, /e\.resolved_at is not null/);
  assert.match(deliveriesRoute, /e\.resolved_at is null/);
});

test("manual resolution clears active risk and replay reopens the delivery", () => {
  assert.match(resolveRoute, /revenue_at_risk = 0/);
  assert.match(dashboard, /risky\.resolved_at is null/);
  assert.match(replay, /resolved_at = null, resolved_by = null, resolution_note = null/);
});
