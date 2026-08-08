import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const inbound = await readFile(new URL("../src/app/in/[endpointId]/route.ts", import.meta.url), "utf8");
const parser = await readFile(new URL("../src/lib/inbound-content.ts", import.meta.url), "utf8");
const simulation = await readFile(new URL("../src/app/api/events/[eventId]/simulate/route.ts", import.meta.url), "utf8");
const embedToken = await readFile(new URL("../src/app/api/embed-token/route.ts", import.meta.url), "utf8");
const embed = await readFile(new URL("../src/lib/embed.ts", import.meta.url), "utf8");
const dashboard = await readFile(new URL("../src/app/api/dashboard/route.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../src/lib/delivery-worker.ts", import.meta.url), "utf8");

test("inbound delivery preserves supported non-JSON request bodies", () => {
  assert.match(parser, /application\/x-www-form-urlencoded/);
  assert.match(parser, /text\/xml/);
  assert.match(parser, /contentType\.startsWith\("text\/"\)/);
  assert.match(inbound, /request_content_type, request_raw_body/);
});

test("simulations are project scoped and isolated from production health", () => {
  assert.match(simulation, /ep\.project_id = \$\{context\.project\.id\}/);
  assert.match(simulation, /is_simulation, parent_event_id/);
  assert.match(dashboard, /e\.is_simulation = false/);
});

test("embedded delivery history uses short-lived signed, project-scoped claims", () => {
  assert.match(embedToken, /project_id = \$\{context\.project\.id\}/);
  assert.match(embedToken, /\.max\(60\)/);
  assert.match(embed, /createHmac\("sha256"/);
  assert.match(embed, /claims\.exp <= Math\.floor\(Date\.now\(\) \/ 1000\)/);
});

test("transient retention scrubs event and message payloads only at terminal state", () => {
  assert.match(worker, /payload_retention_mode = 'transient'/);
  assert.match(worker, /request_raw_body = null/);
  assert.match(worker, /!willRetry/);
});
