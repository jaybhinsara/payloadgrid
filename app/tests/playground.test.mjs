import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
const inboxes = await readFile(new URL("../src/app/api/playground/inboxes/route.ts", import.meta.url), "utf8");
const capture = await readFile(new URL("../src/app/api/playground/in/[token]/route.ts", import.meta.url), "utf8");
const inspection = await readFile(new URL("../src/app/api/playground/inboxes/[token]/route.ts", import.meta.url), "utf8");
const controls = await readFile(new URL("../src/lib/playground.ts", import.meta.url), "utf8");
const maintenance = await readFile(new URL("../src/app/api/cron/maintenance/route.ts", import.meta.url), "utf8");
const component = await readFile(new URL("../src/components/marketing/webhook-playground.tsx", import.meta.url), "utf8");

test("playground inboxes are isolated, bounded, and automatically expired", () => {
  assert.match(schema, /create table if not exists playground_inboxes/);
  assert.match(schema, /references playground_inboxes\(id\) on delete cascade/);
  assert.match(inboxes, /PLAYGROUND_MAX_INBOXES_PER_HOUR/);
  assert.match(capture, /PLAYGROUND_MAX_REQUESTS/);
  assert.match(capture, /PLAYGROUND_MAX_BODY_BYTES/);
  assert.match(maintenance, /delete from playground_inboxes where expires_at <= now\(\)/);
});

test("public capture stores allowlisted diagnostics without secret headers", () => {
  assert.match(capture, /safePlaygroundHeaders/);
  assert.doesNotMatch(controls, /["']authorization["']/i);
  assert.doesNotMatch(controls, /["']cookie["']/i);
  assert.match(inspection, /where token_hash = \$\{sha256\(token\)\} and expires_at > now\(\)/);
  assert.match(controls, /Cache-Control.*no-store/);
});

test("playground UI performs real capture requests instead of a scripted lifecycle", () => {
  assert.match(component, /fetch\("\/api\/playground\/inboxes"/);
  assert.match(component, /method: "POST"/);
  assert.match(component, /CAPTURED REQUESTS/);
  assert.match(component, /Send real test webhook/);
  assert.doesNotMatch(component, /No network request/);
  assert.doesNotMatch(component, /Run delivery simulation/);
});
