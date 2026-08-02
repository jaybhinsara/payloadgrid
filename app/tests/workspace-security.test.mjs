import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const auth = await readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
const switchProject = await readFile(new URL("../src/app/api/auth/switch-project/route.ts", import.meta.url), "utf8");
const workspaceCreate = await readFile(new URL("../src/app/api/workspaces/route.ts", import.meta.url), "utf8");
const workspaceResource = await readFile(new URL("../src/app/api/workspaces/[workspaceId]/route.ts", import.meta.url), "utf8");
const projectResource = await readFile(new URL("../src/app/api/projects/[projectId]/route.ts", import.meta.url), "utf8");

test("session selection honors both active workspace and active project", () => {
  assert.match(auth, /ACTIVE_PROJECT_COOKIE/);
  assert.match(auth, /availableRows\.find\(\(item\) => String\(item\.project_id\) === requestedProject\)/);
});

test("project switching is scoped to the active workspace", () => {
  assert.match(switchProject, /organization_id = \$\{context\.organization\.id\}/);
});

test("new workspaces create an owner membership and production project", () => {
  assert.match(workspaceCreate, /select id, \$\{context\.user\.id\}, 'owner'/);
  assert.match(workspaceCreate, /'Production'.*'production'/s);
});

test("ownership transfer requires the current owner", () => {
  assert.match(workspaceResource, /requireRole\(context, \["owner"\]\)/);
  assert.match(workspaceResource, /role = 'owner'/);
});

test("users cannot leave their only workspace", () => {
  assert.match(workspaceResource, /Create or join another workspace before leaving your only workspace/);
});

test("project mutations are workspace scoped and preserve one project", () => {
  const scopedClauses = projectResource.match(/organization_id = \$\{context\.organization\.id\}/g) || [];
  assert.ok(scopedClauses.length >= 3);
  assert.match(projectResource, /A workspace must keep at least one project/);
});