import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const route = await readFile(new URL("../src/app/api/audit-logs/route.ts", import.meta.url), "utf8");
const view = await readFile(new URL("../src/components/dashboard/views/manage.tsx", import.meta.url), "utf8");

test("audit history pagination remains scoped to the active organization", () => {
  const scopedClauses = route.match(/organization_id = \$\{context\.organization\.id\}/g) || [];
  assert.ok(scopedClauses.length >= 2, "both list and count queries must be organization scoped");
});

test("audit history only accepts supported page sizes", () => {
  assert.match(route, /\[25, 50, 75, 100\]\.includes\(value\)/);
  assert.match(route, /limit \$\{query\.limit\} offset \$\{offset\}/);
});

test("audit view resets to the first page when its page size changes", () => {
  assert.match(view, /setLimit\(Number\(event\.target\.value\)\); setPage\(1\)/);
});
