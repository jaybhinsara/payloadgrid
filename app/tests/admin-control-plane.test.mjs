import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const adminPage = await readFile(new URL("../src/app/admin/page.tsx", import.meta.url), "utf8");
const summaryRoute = await readFile(new URL("../src/app/api/admin/summary/route.ts", import.meta.url), "utf8");
const workspaceRoute = await readFile(new URL("../src/app/api/admin/workspaces/[workspaceId]/route.ts", import.meta.url), "utf8");
const adminConsole = await readFile(new URL("../src/components/admin/admin-console.tsx", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/components/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
const operator = await readFile(new URL("../src/lib/operator.ts", import.meta.url), "utf8");

test("admin page is non-indexable and rejects non-admin sessions on the server", () => {
  assert.match(adminPage, /robots: \{ index: false, follow: false \}/);
  assert.match(adminPage, /getSessionContext\(\)/);
  assert.match(adminPage, /isPlatformAdmin\(context\.user\.email\)/);
  assert.match(adminPage, /redirect\("\/dashboard"\)/);
});

test("global admin APIs require platform admin authorization", () => {
  assert.match(summaryRoute, /requireSession\(\)/);
  assert.match(summaryRoute, /requirePlatformAdmin\(context\)/);
  assert.match(workspaceRoute, /requirePlatformAdmin\(context\)/);
  assert.match(workspaceRoute, /z\.string\(\)\.uuid\(\)/);
});

test("workspace plan overrides are bounded and platform-audited", () => {
  assert.match(workspaceRoute, /z\.enum\(\["free", "starter", "growth", "enterprise"\]\)/);
  assert.match(workspaceRoute, /update organizations set plan=/);
  assert.match(workspaceRoute, /writePlatformAudit/);
  assert.match(workspaceRoute, /workspace\.plan_changed/);
});

test("admin consolidates tenant, incident, publishing, and audit controls", () => {
  assert.match(adminConsole, /WorkspaceAdmin/);
  assert.match(adminConsole, /UserAdmin/);
  assert.match(adminConsole, /OperatorMonitoring/);
  assert.match(adminConsole, /BlogView/);
  assert.match(adminConsole, /AdminAudit/);
  assert.match(adminConsole, /\/api\/admin\/summary/);
});

test("customer dashboard exposes only a conditional link to the separate admin", () => {
  assert.match(dashboard, /data\.system\.admin \? <a className="sidebar-admin" href="\/admin"/);
  assert.doesNotMatch(dashboard, /<BlogView/);
  assert.doesNotMatch(dashboard, /view === "blog"/);
});

test("admin email naming is preferred without breaking existing deployments", () => {
  assert.match(operator, /PAYLOADGRID_ADMIN_EMAILS \|\| process\.env\.PAYLOADGRID_OPERATOR_EMAILS/);
  assert.match(operator, /Platform admin access is required/);
});
