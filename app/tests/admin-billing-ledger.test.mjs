import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [schema, verification, route, view, consoleSource] = await Promise.all([
  read("../db/schema.sql"), read("../src/app/api/verify-payment/route.ts"),
  read("../src/app/api/admin/billing/route.ts"), read("../src/components/admin/admin-billing.tsx"),
  read("../src/components/admin/admin-console.tsx")
]);

test("verified checkout writes an immutable provider payment ledger", () => {
  assert.match(schema, /create table if not exists billing_transactions/);
  assert.match(schema, /unique \(provider, provider_payment_id\)/);
  assert.match(schema, /amount integer not null check \(amount > 0\)/);
  assert.match(verification, /insert into billing_transactions/);
  assert.match(verification, /from payment_record/);
});

test("billing administration is restricted and does not return secrets", () => {
  assert.match(route, /requirePlatformAdmin\(context\)/);
  assert.match(route, /provider_payment_id/);
  assert.doesNotMatch(route, /key_secret|authorization|request_body/i);
  assert.match(route, /limit: z\.coerce\.number\(\)\.int\(\)\.min\(25\)\.max\(100\)/);
});

test("admin exposes searchable billing reconciliation", () => {
  assert.match(consoleSource, /AdminBilling/);
  assert.match(consoleSource, /label: "Billing"/);
  assert.match(view, /Workspace, order, or payment ID/);
  assert.match(view, /\[25, 50, 75, 100\]/);
  assert.match(view, /No verified purchases match these filters/);
});
