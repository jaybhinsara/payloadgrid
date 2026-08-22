import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("direct dependencies are pinned exactly", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
    assert.match(version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, `${name} must use an exact version`);
  }
});

test("page security headers protect normal pages without breaking embeds", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  for (const header of ["Content-Security-Policy", "Strict-Transport-Security", "X-Content-Type-Options", "Referrer-Policy", "Permissions-Policy"]) {
    assert.match(proxy, new RegExp(header));
  }
  assert.match(proxy, /frame-ancestors 'none'/);
  assert.match(proxy, /frame-ancestors https:/);
  assert.match(proxy, /if \(!embedded\) response\.headers\.set\("X-Frame-Options", "DENY"\)/);
});

test("migration runner checks checksums and requires explicit confirmation", () => {
  const migration = readFileSync("ops/migrate.mjs", "utf8");
  assert.match(migration, /payloadgrid_schema_migrations/);
  assert.match(migration, /createHash\("sha256"\)/);
  assert.match(migration, /MIGRATION_CONFIRM/);
  assert.match(migration, /Applied migration .* was modified/);
});

test("runtime verification scripts remain available", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  assert.ok(pkg.scripts["test:smoke"]);
  assert.ok(pkg.scripts["test:integration"]);
  assert.ok(pkg.scripts["config:check"]);
  assert.ok(pkg.scripts["security:audit"]);
});
