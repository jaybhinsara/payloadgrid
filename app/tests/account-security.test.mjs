import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("account security schema stores device metadata, audit history, and abuse windows", async () => {
  const schema = await read("db/schema.sql");
  for (const value of ["user_agent", "ip_address", "account_audit_logs", "auth_rate_limit_windows"]) assert.match(schema, new RegExp(value));
});

test("verification recovery is generic, expiring, and rate limited", async () => {
  const route = await read("src/app/api/auth/resend-verification/route.ts");
  assert.match(route, /EMAIL_VERIFICATION_HOURS/);
  assert.match(route, /verification-resend-ip/);
  assert.match(route, /verification-resend-email/);
  assert.match(route, /If this address belongs to an unverified account/);
  assert.match(route, /email_verified_at is null/);
});

test("users can inspect and revoke only their own sessions", async () => {
  const route = await read("src/app/api/auth/sessions/route.ts");
  assert.match(route, /where user_id = \$\{context\.user\.id\}/);
  assert.match(route, /token_hash <> \$\{currentHash\}/);
  assert.match(route, /other_sessions_revoked/);
  assert.match(route, /all_sessions_revoked/);
  assert.match(route, /destroySession/);
});

test("maintenance removes only abandoned unverified accounts and orphan workspaces", async () => {
  const route = await read("src/app/api/cron/maintenance/route.ts");
  assert.match(route, /UNVERIFIED_ACCOUNT_RETENTION_DAYS/);
  assert.match(route, /verification_required = true and email_verified_at is null/);
  assert.match(route, /not exists \(select 1 from sessions/);
  assert.match(route, /not exists \(select 1 from organization_members/);
  assert.match(route, /limit 100/);
});

test("dashboard exposes active devices and private account history", async () => {
  const [dashboard, view] = await Promise.all([
    read("src/components/dashboard/dashboard-client.tsx"),
    read("src/components/dashboard/views/account-security.tsx")
  ]);
  assert.match(dashboard, /Account security/);
  assert.match(view, /Sign out other devices/);
  assert.match(view, /Sign out everywhere/);
  assert.match(view, /Recent security activity/);
});
