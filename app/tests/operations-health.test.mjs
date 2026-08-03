import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publicRoute = await readFile(new URL("../src/app/api/health/route.ts", import.meta.url), "utf8");
const privateRoute = await readFile(new URL("../src/app/api/operations/health/route.ts", import.meta.url), "utf8");
const statusPage = await readFile(new URL("../src/app/status/page.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/dashboard/dashboard-client.tsx", import.meta.url), "utf8");

test("public health exposes customer-facing service states only", () => {
  assert.match(publicRoute, /readPublicHealth\(\)/);
  assert.doesNotMatch(publicRoute, /deliveryQueue|pendingDeliveries|oldestPendingSeconds|database/);
  assert.doesNotMatch(statusPage, /QStash|PostgreSQL|fallback/i);
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
