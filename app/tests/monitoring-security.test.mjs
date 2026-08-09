import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cronRoute = await readFile(new URL("../src/app/api/cron/monitor/route.ts", import.meta.url), "utf8");
const maintenanceRoute = await readFile(new URL("../src/app/api/cron/maintenance/route.ts", import.meta.url), "utf8");
const monitoringRoute = await readFile(new URL("../src/app/api/operations/monitoring/route.ts", import.meta.url), "utf8");
const incidentRoute = await readFile(new URL("../src/app/api/operations/incidents/[incidentId]/route.ts", import.meta.url), "utf8");
const monitoring = await readFile(new URL("../src/lib/monitoring.ts", import.meta.url), "utf8");
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");

test("synthetic monitoring requires the protected cron secret", () => {
  assert.match(cronRoute, /process\.env\.CRON_SECRET/);
  assert.match(cronRoute, /authorization/);
  assert.match(cronRoute, /status: 401/);
});

test("platform monitoring and incident mutation require an operator", () => {
  for (const route of [monitoringRoute, incidentRoute]) {
    assert.match(route, /requireSession\(\)/);
    assert.match(route, /requirePlatformOperator\(context\)/);
  }
});

test("incident lifecycle requires repeated failures and recoveries", () => {
  assert.match(monitoring, /limit 3/);
  assert.match(monitoring, /limit 2/);
  assert.match(schema, /incidents_one_open_per_service_idx/);
  assert.match(schema, /where status <> 'resolved'/);
});

test("maintenance bounds raw service check history", () => {
  assert.match(maintenanceRoute, /from service_checks/);
  assert.match(maintenanceRoute, /row_count >= 1000/);
  assert.match(maintenanceRoute, /offset 100/);
  assert.match(maintenanceRoute, /delete from service_checks/);
  assert.match(maintenanceRoute, /prunedServiceChecks/);
});
