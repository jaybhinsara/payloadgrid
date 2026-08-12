import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicRoute = await readFile(new URL("../src/app/api/health/route.ts", import.meta.url), "utf8");
const privateRoute = await readFile(new URL("../src/app/api/operations/health/route.ts", import.meta.url), "utf8");
const statusPage = await readFile(new URL("../src/app/status/page.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
const health = await readFile(new URL("../src/lib/health.ts", import.meta.url), "utf8");

test("public health exposes customer-facing service states only", () => {
  assert.match(publicRoute, /readPublicHealth\(\)/);
  assert.doesNotMatch(publicRoute, /deliveryQueue|pendingDeliveries|oldestPendingSeconds|database/);
  assert.doesNotMatch(statusPage, /QStash|PostgreSQL|fallback/i);
});

test("health marks only overdue delivery and dispatch work as degraded", () => {
  assert.match(health, /status = 'retrying' and coalesce\(next_retry_at, updated_at\) <= now\(\)/);
  assert.match(health, /status = 'pending' and available_at <= now\(\)/);
  assert.match(health, /status = 'publishing' then coalesce\(locked_at, updated_at\)/);
  assert.doesNotMatch(health, /status <> 'published'/);
  assert.doesNotMatch(health, /min\(received_at\).*retrying/s);
});

test("private diagnostics require elevated workspace access", () => {
  assert.match(privateRoute, /requireSession\(\)/);
  assert.match(privateRoute, /requireRole\(context, \["owner", "admin"\]\)/);
});

test("private diagnostics are scoped to the active project", () => {
  assert.match(privateRoute, /readSystemHealth\(context\.project\.id\)/);
});

test("system health navigation is hidden from non-administrators", () => {
  assert.match(dashboard, /item\.id !== "operations" \|\| \["owner", "admin"\]\.includes\(data\.context\.organization\.role\)/);
  assert.match(dashboard, /view === "operations" && \["owner", "admin"\]\.includes\(data\.context\.organization\.role\)/);
});
