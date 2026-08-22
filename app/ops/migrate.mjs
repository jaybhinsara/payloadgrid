import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2] || "status";
const databaseUrl = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set MIGRATION_DATABASE_URL or DATABASE_URL");
if (!["bootstrap", "baseline", "migrate", "status"].includes(mode)) throw new Error("Use bootstrap, baseline, migrate, or status");
if (mode !== "status" && process.env.MIGRATION_CONFIRM !== "payloadgrid") {
  throw new Error("Set MIGRATION_CONFIRM=payloadgrid before changing a database");
}

const sql = neon(databaseUrl);
if (mode === "status") {
  const [{ migration_table_exists: exists }] = await sql.query("select to_regclass('public.payloadgrid_schema_migrations') is not null as migration_table_exists");
  if (!exists) {
    console.log("Migration history is not initialized. Use db:baseline for an existing current database or db:bootstrap for an empty database.");
    process.exit(2);
  }
}
if (mode !== "status") {
  await sql.query(`create table if not exists payloadgrid_schema_migrations (
    version text primary key,
    checksum text not null,
    status text not null check (status in ('running', 'applied')),
    applied_at timestamptz not null default now()
  )`);
}

const migrationDir = path.join(root, "db", "migrations");
const names = (await readdir(migrationDir)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
const migrations = await Promise.all(names.map(async (name) => {
  const body = await readFile(path.join(migrationDir, name), "utf8");
  return { version: name.replace(/\.sql$/, ""), body, checksum: createHash("sha256").update(body).digest("hex") };
}));

const applied = await sql.query("select version, checksum, status, applied_at from payloadgrid_schema_migrations order by version");
const byVersion = new Map(applied.map((row) => [String(row.version), row]));
for (const migration of migrations) {
  const row = byVersion.get(migration.version);
  if (row && String(row.checksum) !== migration.checksum) throw new Error(`Applied migration ${migration.version} was modified`);
  if (row?.status === "running") throw new Error(`Migration ${migration.version} is still marked running; investigate before continuing`);
}

if (mode === "status") {
  for (const migration of migrations) console.log(`${byVersion.has(migration.version) ? "applied" : "pending"}  ${migration.version}`);
  process.exit(migrations.some((migration) => !byVersion.has(migration.version)) ? 2 : 0);
}

const [{ application_schema_exists: schemaExists }] = await sql.query("select to_regclass('public.organizations') is not null as application_schema_exists");
if (mode === "bootstrap") {
  if (schemaExists) throw new Error("Application tables already exist. Use baseline only after confirming db/schema.sql was applied, or migrate when migration history exists.");
  await sql.query(await readFile(path.join(root, "db", "schema.sql"), "utf8"));
}
if (mode === "baseline" && !schemaExists) throw new Error("Cannot baseline an empty database; use bootstrap");
if (mode === "migrate" && !schemaExists) throw new Error("Cannot migrate an empty database; use bootstrap");
if (mode === "migrate" && schemaExists && applied.length === 0) throw new Error("Existing database has no migration history. Run db:baseline after confirming it matches db/schema.sql");

if (mode === "bootstrap" || mode === "baseline") {
  for (const migration of migrations) {
    await sql.query("insert into payloadgrid_schema_migrations(version, checksum, status) values ($1, $2, 'applied') on conflict (version) do nothing", [migration.version, migration.checksum]);
  }
  console.log(`${mode === "bootstrap" ? "Bootstrapped" : "Baselined"} ${migrations.length} migrations.`);
  process.exit(0);
}

for (const migration of migrations.filter((item) => !byVersion.has(item.version))) {
  const claimed = await sql.query("insert into payloadgrid_schema_migrations(version, checksum, status) values ($1, $2, 'running') on conflict do nothing returning version", [migration.version, migration.checksum]);
  if (!claimed.length) throw new Error(`Migration ${migration.version} was claimed by another process`);
  try {
    await sql.query(migration.body);
    await sql.query("update payloadgrid_schema_migrations set status='applied', applied_at=now() where version=$1", [migration.version]);
    console.log(`Applied ${migration.version}`);
  } catch (error) {
    await sql.query("delete from payloadgrid_schema_migrations where version=$1 and status='running'", [migration.version]);
    throw error;
  }
}
console.log("Database migrations are current.");
