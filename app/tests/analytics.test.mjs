import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("delivery analytics are bounded, project scoped, and exclude simulations", async () => {
  const [route, view, dashboard] = await Promise.all([
    read("../src/app/api/analytics/route.ts"),
    read("../src/components/dashboard/views/analytics.tsx"),
    read("../src/components/dashboard/dashboard-client.tsx")
  ]);
  assert.match(route, /range: z\.enum\(\["24h", "7d", "30d"\]\)/);
  assert.match(route, /ep\.project_id = \$\{context\.project\.id\}/);
  assert.match(route, /e\.is_simulation = false/);
  assert.match(route, /percentile_cont\(0\.5\)/);
  assert.match(route, /percentile_cont\(0\.95\)/);
  assert.match(route, /terminal \? Math\.round\(delivered \/ terminal/);
  assert.match(view, /All endpoints/);
  assert.match(view, /All event types/);
  assert.match(view, /Traffic over time/);
  assert.match(dashboard, /id: "analytics"/);
});
