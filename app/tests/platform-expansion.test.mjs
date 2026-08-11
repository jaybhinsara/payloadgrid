import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("event contracts are standard, versioned, application scoped, and non-blocking", async () => {
  const [schema, contracts, outbound, inbound] = await Promise.all([read("../db/schema.sql"), read("../src/lib/event-contracts.ts"), read("../src/lib/outbound.ts"), read("../src/app/in/[endpointId]/route.ts")]);
  assert.match(schema, /create table if not exists event_contract_versions/);
  assert.match(schema, /application_id uuid references applications/);
  assert.match(schema, /validation_warnings jsonb/);
  assert.match(contracts, /Ajv2020/);
  assert.match(contracts, /compatibilityWarnings/);
  assert.match(outbound, /validateEventPayload/);
  assert.match(inbound, /validateEventPayload/);
  assert.doesNotMatch(outbound, /throw.*validationWarnings/);
});

test("delivery search and controlled replay remain project scoped", async () => {
  const [deliveries, replay, schema] = await Promise.all([read("../src/app/api/deliveries/route.ts"), read("../src/app/api/events/bulk-replay/route.ts"), read("../db/schema.sql")]);
  for (const term of ["headerName", "payloadPath", "eventType", "endpointId"]) assert.match(deliveries, new RegExp(term));
  assert.match(replay, /ep\.project_id = \$1/);
  assert.match(replay, /rateLimitPerMinute/);
  assert.match(replay, /distinct on/);
  assert.match(replay, /status='cancelled'/);
  assert.match(schema, /create table if not exists replay_batches/);
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
