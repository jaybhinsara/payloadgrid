import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("event contracts are standard, versioned, application scoped, and non-blocking", async () => {
  const [schema, contracts, outbound, inbound, versionApi, dashboard, contractView] = await Promise.all([read("../db/schema.sql"), read("../src/lib/event-contracts.ts"), read("../src/lib/outbound.ts"), read("../src/app/in/[endpointId]/route.ts"), read("../src/app/api/event-types/[eventTypeId]/route.ts"), read("../src/app/api/dashboard/route.ts"), read("../src/components/dashboard/views/activity.tsx")]);
  assert.match(schema, /create table if not exists event_contract_versions/);
  assert.match(schema, /application_id uuid references applications/);
  assert.match(schema, /validation_warnings jsonb/);
  assert.match(contracts, /Ajv2020/);
  assert.match(contracts, /compatibilityWarnings/);
  assert.match(contracts, /validatorCache/);
  assert.match(contracts, /assertExampleMatchesSchema/);
  assert.match(contracts, /enum value/);
  assert.match(outbound, /validateEventPayload/);
  assert.match(inbound, /validateEventPayload/);
  assert.doesNotMatch(outbound, /throw.*validationWarnings/);
  assert.match(versionApi, /dryRun/);
  assert.match(dashboard, /contract_version, validation_warnings/);
  assert.match(contractView, /Manage versions/);
  assert.match(contractView, /Check compatibility/);
});

test("delivery search and controlled replay remain project scoped", async () => {
  const [deliveries, replay, cancel, worker, schema] = await Promise.all([read("../src/app/api/deliveries/route.ts"), read("../src/app/api/events/bulk-replay/route.ts"), read("../src/app/api/events/bulk-cancel/route.ts"), read("../src/lib/delivery-worker.ts"), read("../db/schema.sql")]);
  for (const term of ["headerName", "payloadPath", "eventType", "endpointId"]) assert.match(deliveries, new RegExp(term));
  assert.match(replay, /ep\.project_id = \$1/);
  assert.match(replay, /rateLimitPerMinute/);
  assert.match(replay, /distinct on/);
  assert.match(replay, /status='cancelled'/);
  assert.match(schema, /create table if not exists replay_batches/);
  assert.match(cancel, /ep\.project_id = \$1/);
  assert.match(cancel, /status in \('queued','received','retrying'\)/);
  assert.match(cancel, /dispatch_jobs set status='cancelled'/);
  assert.match(worker, /status in \('queued','received','retrying'\)/);
  assert.match(schema, /'cancelled', 'failed'/);
});

test("catalog, embedded management, and CLI use scoped APIs", async () => {
  const [catalog, embed, token, cli] = await Promise.all([read("../src/app/catalog/[applicationUid]/page.tsx"), read("../src/app/api/embed/endpoints/route.ts"), read("../src/lib/embed.ts"), read("../packages/cli/bin/payloadgrid.mjs")]);
  assert.match(catalog, /JSON Schema 2020-12/);
  assert.match(embed, /value\.applicationId/);
  assert.match(embed, /subscriptions:write/);
  assert.match(embed, /secrets:rotate/);
  assert.match(token, /endpoints:write/);
  assert.match(cli, /command === "tail"/);
  assert.match(cli, /command === "inspect"/);
  assert.match(cli, /command === "types"/);
});

test("revenue tracking is optional, endpoint scoped, and currency explicit", async () => {
  const [schema, inbound, constants, endpointApi, dashboard, routing] = await Promise.all([read("../db/schema.sql"), read("../src/app/in/[endpointId]/route.ts"), read("../src/lib/constants.ts"), read("../src/app/api/endpoints/route.ts"), read("../src/app/api/dashboard/route.ts"), read("../src/components/dashboard/views/routing.tsx")]);
  assert.match(schema, /revenue_tracking_mode text not null default 'disabled'/);
  assert.match(schema, /revenue_amount_unit in \('major', 'minor'\)/);
  assert.match(endpointApi, /revenueTrackingMode.*disabled/);
  assert.match(inbound, /revenue_tracking_mode/);
  assert.match(constants, /configuration\.mode === "disabled"/);
  assert.match(constants, /configuration\.amountUnit === "minor"/);
  assert.match(dashboard, /revenueTrackingEnabled/);
  assert.match(routing, /currencySymbol/);
  assert.match(routing, /Disabled · no payment data required/);
});
