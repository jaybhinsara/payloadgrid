import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";

const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required");
if (process.env.PAYLOADGRID_TEST_DATABASE_CONFIRM !== "isolated") throw new Error("Set PAYLOADGRID_TEST_DATABASE_CONFIRM=isolated after confirming this is a disposable database or branch");
if (testUrl === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must not equal DATABASE_URL");

const sql = neon(testUrl);
const [{ ready }] = await sql.query("select to_regclass('public.organizations') is not null and to_regclass('public.messages') is not null as ready");
if (!ready) throw new Error("Apply the current schema to TEST_DATABASE_URL before running integration tests");

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.INTEGRATION_PORT || 3216);
const origin = `http://127.0.0.1:${port}`;
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const suffix = randomBytes(6).toString("hex");
const organizationA = randomUUID();
const organizationB = randomUUID();
const projectA = randomUUID();
const projectB = randomUUID();
const applicationA = randomUUID();
const applicationB = randomUUID();
const apiKeyId = randomUUID();
const token = `pg_live_${randomBytes(30).toString("base64url")}`;
const tokenHash = createHash("sha256").update(token).digest("hex");
let server;
let output = "";

async function waitUntilReady() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited before integration tests:\n${output}`);
    try { if ((await fetch(origin)).status < 500) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Next.js did not become ready:\n${output}`);
}

try {
  await sql.query("insert into organizations(id,name,slug,plan) values ($1,$2,$3,'free'),($4,$5,$6,'free')", [organizationA, "Integration A", `integration-a-${suffix}`, organizationB, "Integration B", `integration-b-${suffix}`]);
  await sql.query("insert into projects(id,organization_id,name,slug,environment) values ($1,$2,$3,$4,'production'),($5,$6,$7,$8,'production')", [projectA, organizationA, "Integration A", `integration-a-${suffix}`, projectB, organizationB, "Integration B", `integration-b-${suffix}`]);
  await sql.query("insert into applications(id,project_id,name,uid) values ($1,$2,$3,$4),($5,$6,$7,$8)", [applicationA, projectA, "Application A", `app_a_${suffix}`, applicationB, projectB, "Application B", `app_b_${suffix}`]);
  await sql.query("insert into api_keys(id,project_id,name,key_prefix,key_hash,scopes) values ($1,$2,$3,$4,$5,array['messages:write']::text[])", [apiKeyId, projectA, "Integration key", token.slice(0, 16), tokenHash]);

  server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: testUrl, QSTASH_TOKEN: "", QSTASH_CURRENT_SIGNING_KEY: "", QSTASH_NEXT_SIGNING_KEY: "", PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"]
  });
  server.stdout.on("data", (chunk) => { output += chunk; });
  server.stderr.on("data", (chunk) => { output += chunk; });
  await waitUntilReady();

  const send = (applicationId, idempotencyKey, authorization = token) => fetch(`${origin}/api/v1/messages`, {
    method: "POST",
    headers: { authorization: `Bearer ${authorization}`, "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ applicationId, eventType: "integration.checked", payload: { test: true, suffix } })
  });

  const unauthorized = await send(applicationA, `unauthorized-${suffix}`, "invalid_token_that_is_long_enough_123456");
  assert.equal(unauthorized.status, 401);

  const accepted = await send(applicationA, `accepted-${suffix}`);
  assert.equal(accepted.status, 202);
  assert.equal((await accepted.json()).duplicate, false);

  const duplicate = await send(applicationA, `accepted-${suffix}`);
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);

  const crossTenant = await send(applicationB, `cross-${suffix}`);
  assert.equal(crossTenant.status, 404);
  const [{ own_count: ownCount }] = await sql.query("select count(*)::int as own_count from messages where project_id=$1", [projectA]);
  const [{ foreign_count: foreignCount }] = await sql.query("select count(*)::int as foreign_count from messages where project_id=$1", [projectB]);
  assert.equal(Number(ownCount), 1);
  assert.equal(Number(foreignCount), 0);
  console.log("Integration tests passed for authentication, idempotency, acceptance, and tenant isolation.");
} finally {
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 3_000))]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  await sql.query("delete from organizations where id=$1 or id=$2", [organizationA, organizationB]);
}
