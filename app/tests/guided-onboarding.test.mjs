import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardRoute = await readFile(new URL("../src/app/api/dashboard/route.ts", import.meta.url), "utf8");
const wizard = await readFile(new URL("../src/components/dashboard/onboarding.tsx", import.meta.url), "utf8");
const dashboardClient = await readFile(new URL("../src/components/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
const overview = await readFile(new URL("../src/components/dashboard/views/overview.tsx", import.meta.url), "utf8");
const templates = await readFile(new URL("../src/lib/onboarding.ts", import.meta.url), "utf8");

test("workspace activation is derived from project-scoped production records", () => {
  assert.match(dashboardRoute, /applications where project_id=\$\{context\.project\.id\}/);
  assert.match(dashboardRoute, /api_keys where project_id=\$\{context\.project\.id\} and revoked_at is null/);
  assert.match(dashboardRoute, /e\.is_simulation=false and e\.status='delivered'/);
  assert.match(dashboardRoute, /completed: activationFlags\.every\(Boolean\)/);
});

test("guided setup requires scoped API access and a confirmed delivery", () => {
  assert.match(wizard, /scopes: \["messages:write", "events:read"\]/);
  assert.match(wizard, /data\.activation\.deliverySucceeded/);
  assert.match(wizard, /waiting for the destination to return a successful 2xx response/i);
  assert.match(wizard, /revealKey\(String\(result\.token\)\)/);
  assert.doesNotMatch(wizard, /localStorage/);
});

test("onboarding offers global provider presets without locking out generic APIs", () => {
  for (const provider of ["custom", "razorpay", "stripe", "cashfree", "shopify"]) {
    assert.match(templates, new RegExp(`provider: "${provider}"`));
  }
  assert.match(templates, /revenueTracking: false/);
  assert.match(templates, /revenueTracking: true/);
});

test("activation dismissal and overview progress are scoped to the current project", () => {
  assert.match(dashboardClient, /payloadgrid:onboarding:\$\{data\.context\.project\.id\}/);
  assert.match(dashboardClient, /data\.activation\.completed/);
  assert.match(overview, /data\.activation\.completedSteps/);
  assert.match(overview, /data\.activation\.deliverySucceeded/);
});
