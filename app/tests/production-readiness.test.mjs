import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { verifyWebhook } from "../packages/sdk-typescript/index.js";

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const outbound = await readFile(new URL("../src/lib/outbound.ts", import.meta.url), "utf8");
const outbox = await readFile(new URL("../src/lib/dispatch-outbox.ts", import.meta.url), "utf8");
const worker = await readFile(new URL("../src/lib/delivery-worker.ts", import.meta.url), "utf8");
const batch = await readFile(new URL("../src/app/api/v1/messages/batch/route.ts", import.meta.url), "utf8");
const relay = await readFile(new URL("../src/app/api/v1/relay/events/route.ts", import.meta.url), "utf8");
const embedToken = await readFile(new URL("../src/app/api/v1/embed-token/route.ts", import.meta.url), "utf8");

test("message acceptance commits fan-out and dispatch intent together", () => {
  assert.match(schema, /create table if not exists dispatch_jobs/);
  assert.match(schema, /event_id uuid not null unique/);
  assert.match(outbound, /insert into webhook_events/);
  assert.match(outbound, /insert into dispatch_jobs/);
  assert.doesNotMatch(outbound, /enqueueDelivery/);
});

test("embedded portal tokens require a dedicated scope and project-bound application", () => {
  assert.match(embedToken, /embeds:write/);
  assert.match(embedToken, /applicationId.*project_id/s);
  assert.match(embedToken, /deliveries:read/);
  assert.match(embedToken, /deliveries:replay/);
  assert.match(embedToken, /cache-control.*no-store/);
});

test("outbox supports concurrent claims and stale publication recovery", () => {
  assert.match(outbox, /for update skip locked/);
  assert.match(outbox, /status = 'publishing'/);
  assert.match(outbox, /Published job exceeded its delivery acknowledgement window/);
  assert.match(worker, /insert into dispatch_jobs/);
});

test("batch and local relay enforce bounded, scoped access", () => {
  assert.match(batch, /MAX_BATCH_EVENTS/);
  assert.match(batch, /MAX_BATCH_BODY_BYTES/);
  assert.match(batch, /messages:write/);
  assert.match(relay, /events:read/);
  assert.match(relay, /endpoint_id = \$1/);
});

test("TypeScript SDK verifies either signature during secret rotation", () => {
  const rawBody = '{"orderId":"8921"}';
  const id = "evt_test";
  const timestamp = String(Math.floor(Date.now() / 1000));
  const oldSignature = createHmac("sha256", "old-secret").update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  const newSignature = createHmac("sha256", "new-secret").update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  const headers = {
    "payloadgrid-id": id,
    "payloadgrid-timestamp": timestamp,
    "payloadgrid-signature": `v1,${newSignature} v1,${oldSignature}`
  };
  assert.deepEqual(verifyWebhook(rawBody, headers, "old-secret"), { id, timestamp: Number(timestamp) });
  assert.deepEqual(verifyWebhook(rawBody, headers, "new-secret"), { id, timestamp: Number(timestamp) });
  assert.throws(() => verifyWebhook(rawBody, headers, "wrong-secret"), /verification failed/);
});
