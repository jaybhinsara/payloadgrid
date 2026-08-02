import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const memberRoute = await readFile(new URL("../src/app/api/team/[userId]/route.ts", import.meta.url), "utf8");
const inviteRoute = await readFile(new URL("../src/app/api/team/route.ts", import.meta.url), "utf8");

test("member updates and removals are organization scoped", () => {
  const scopedClauses = memberRoute.match(/organization_id = \$\{context\.organization\.id\}/g) || [];
  assert.ok(scopedClauses.length >= 2);
});

test("only owners and admins can manage members", () => {
  const roleChecks = memberRoute.match(/requireRole\(context, \["owner", "admin"\]\)/g) || [];
  assert.equal(roleChecks.length, 2);
});

test("owner and self membership are protected", () => {
  assert.match(memberRoute, /target\.role\) === "owner"/);
  assert.match(memberRoute, /target\.user_id\) === actorId/);
});

test("invite upsert cannot overwrite the owner role", () => {
  assert.match(inviteRoute, /existing\?\.role === "owner"/);
});