import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const resourceRoute = await readFile(new URL("../src/app/api/settings/[resourceId]/route.ts", import.meta.url), "utf8");
const testRoute = await readFile(new URL("../src/app/api/settings/[resourceId]/test/route.ts", import.meta.url), "utf8");
const dashboardRoute = await readFile(new URL("../src/app/api/dashboard/route.ts", import.meta.url), "utf8");
const createRoute = await readFile(new URL("../src/app/api/settings/route.ts", import.meta.url), "utf8");

test("automation mutations are scoped to the active project", () => {
  const scopedClauses = resourceRoute.match(/project_id = \$\{context\.project\.id\}/g) || [];
  assert.ok(scopedClauses.length >= 4, "expected every lookup, update, and delete path to be project scoped");
});

test("automation deletion requires an elevated organization role", () => {
  assert.match(resourceRoute, /requireRole\(context, \["owner", "admin"\]\)/);
});

test("alert tests require a managing role and a project-scoped rule", () => {
  assert.match(testRoute, /requireRole\(context, \["owner", "admin", "developer"\]\)/);
  assert.match(testRoute, /project_id = \$\{context\.project\.id\}/);
});

test("alert history cannot cross project boundaries", () => {
  assert.match(dashboardRoute, /where r\.project_id = \$\{context\.project\.id\}/);
});

test("new alert webhook destinations receive SSRF validation", () => {
  assert.match(createRoute, /assertSafeDestinationUrl\(body\.destination\)/);
});