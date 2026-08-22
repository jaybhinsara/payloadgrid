import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.SMOKE_PORT || 3215);
const origin = `http://127.0.0.1:${port}`;
const nextBin = path.join(root, "node_modules", "next", "dist", "bin", "next");
const server = spawn(process.execPath, [nextBin, "start", "-p", String(port)], {
  cwd: root,
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let output = "";
server.stdout.on("data", (chunk) => { output += chunk; });
server.stderr.on("data", (chunk) => { output += chunk; });

async function waitUntilReady() {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Next.js exited before smoke tests:\n${output}`);
    try {
      const response = await fetch(origin, { redirect: "manual" });
      if (response.status < 500) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Next.js did not become ready:\n${output}`);
}

function assertCommonHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.match(response.headers.get("strict-transport-security") || "", /max-age=63072000/);
}

try {
  await waitUntilReady();
  const home = await fetch(origin, { redirect: "manual" });
  assert.equal(home.status, 200);
  assertCommonHeaders(home);
  assert.match(home.headers.get("content-security-policy") || "", /frame-ancestors 'none'/);
  assert.equal(home.headers.get("x-frame-options"), "DENY");

  const dashboard = await fetch(`${origin}/dashboard`, { redirect: "manual" });
  assert.ok([307, 308].includes(dashboard.status));
  assert.match(dashboard.headers.get("location") || "", /\/login\?next=%2Fdashboard/);
  assertCommonHeaders(dashboard);

  const embed = await fetch(`${origin}/embed/deliveries`, { redirect: "manual" });
  assert.ok(embed.status < 500);
  assert.match(embed.headers.get("content-security-policy") || "", /frame-ancestors https:/);
  assert.equal(embed.headers.get("x-frame-options"), null);
  console.log("HTTP smoke tests passed for public, protected, and embedded pages.");
} finally {
  server.kill("SIGTERM");
  await Promise.race([new Promise((resolve) => server.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 3_000))]);
  if (server.exitCode === null) server.kill("SIGKILL");
}
