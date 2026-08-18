import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const [schema, auth, login, oauth, apiAuth, inbound, outbox, worker, userAdmin, workspaceAdmin, summary, consoleSource, embedPage, embedEndpoints, embedReplay] = await Promise.all([
  read("../db/schema.sql"), read("../src/lib/auth.ts"), read("../src/app/api/auth/login/route.ts"), read("../src/lib/oauth.ts"),
  read("../src/lib/api-auth.ts"), read("../src/app/in/[endpointId]/route.ts"), read("../src/lib/dispatch-outbox.ts"),
  read("../src/lib/delivery-worker.ts"), read("../src/app/api/admin/users/[userId]/route.ts"),
  read("../src/app/api/admin/workspaces/[workspaceId]/route.ts"), read("../src/app/api/admin/summary/route.ts"),
  read("../src/components/admin/admin-console.tsx"), read("../src/app/embed/deliveries/page.tsx"),
  read("../src/app/api/embed/endpoints/route.ts"), read("../src/app/api/embed/events/[eventId]/replay/route.ts")
]);

test("lifecycle schema is additive for users and workspaces", () => {
  assert.match(schema, /alter table users add column if not exists suspended_at timestamptz/);
  assert.match(schema, /alter table organizations add column if not exists suspended_at timestamptz/);
  assert.match(schema, /suspension_reason text/);
  assert.match(schema, /suspended_by uuid references users\(id\) on delete set null/);
});

test("suspended accounts cannot authenticate or retain sessions", () => {
  assert.match(auth, /u\.suspended_at is null and o\.suspended_at is null/);
  assert.match(login, /This account is suspended/);
  assert.match(oauth, /account_suspended/);
  assert.match(userAdmin, /delete from sessions where user_id=/);
  assert.match(userAdmin, /force_logout/);
});

test("workspace suspension closes every public delivery boundary", () => {
  assert.match(apiAuth, /o\.suspended_at is null/);
  assert.match(inbound, /o\.suspended_at is null/);
  assert.match(outbox, /o\.suspended_at is null/);
  assert.match(worker, /o\.suspended_at is null/);
  assert.match(embedPage, /o\.suspended_at is null/);
  assert.match(embedEndpoints, /o\.suspended_at is null/);
  assert.match(embedReplay, /o\.suspended_at is null/);
});

test("reactivation restores pending dispatch without losing events", () => {
  assert.match(workspaceAdmin, /action: z\.enum\(\["suspend", "reactivate"\]\)/);
  assert.match(workspaceAdmin, /insert into dispatch_jobs/);
  assert.match(workspaceAdmin, /on conflict \(event_id\) do update set status='pending'/);
  assert.match(workspaceAdmin, /workspace\.\$\{body\.action\}/);
});

test("admin exposes lifecycle status, reason capture, and workspace inspection", () => {
  assert.match(summary, /o\.suspended_at, o\.suspension_reason/);
  assert.match(summary, /u\.suspended_at, u\.suspension_reason/);
  assert.match(consoleSource, /AdminLifecycleDialog/);
  assert.match(consoleSource, /WorkspaceDetailDialog/);
  assert.match(consoleSource, /Force .* to sign out|Force \$\{user\.name\} to sign out/);
  assert.match(consoleSource, /Required for the audit history/);
  assert.match(workspaceAdmin, /export async function GET/);
});
