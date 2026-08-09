#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(homedir(), ".payloadgrid", "config.json");

function args(argv) {
  const result = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) result._.push(value);
    else if (value.includes("=")) {
      const [key, ...rest] = value.slice(2).split("="); result[key] = rest.join("=");
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) result[value.slice(2)] = argv[++index];
    else result[value.slice(2)] = true;
  }
  return result;
}

async function config() {
  try { return JSON.parse(await readFile(CONFIG_PATH, "utf8")); }
  catch { return {}; }
}

async function saveConfig(value) {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await chmod(CONFIG_PATH, 0o600).catch(() => {});
}

function help() {
  console.log(`PayloadGrid CLI

  pg login --api-key pg_live_... [--api-url https://payloadgrid.com]
  pg listen --endpoint UUID --forward http://localhost:3000/webhooks [--history] [--once]

The API key used by listen must include the events:read scope.`);
}

async function login(options) {
  const apiKey = String(options["api-key"] || process.env.PAYLOADGRID_API_KEY || "");
  if (!apiKey) throw new Error("--api-key or PAYLOADGRID_API_KEY is required");
  const apiUrl = String(options["api-url"] || process.env.PAYLOADGRID_API_URL || "https://payloadgrid.com").replace(/\/$/, "");
  await saveConfig({ apiKey, apiUrl });
  console.log(`Authenticated for ${apiUrl}. Credentials saved to ${CONFIG_PATH}`);
}

async function forwardEvent(event, destination) {
  if (event.redacted || event.body === null) return { skipped: true, reason: "payload redacted" };
  const response = await fetch(destination, {
    method: "POST",
    headers: {
      "content-type": event.contentType || "application/json",
      "user-agent": "PayloadGrid-Relay/0.1",
      "x-payloadgrid-relay-event-id": event.id,
      "x-payloadgrid-event-type": event.eventType,
      "x-payloadgrid-original-provider": event.provider
    },
    body: event.body,
    signal: AbortSignal.timeout(15000)
  });
  return { skipped: false, status: response.status };
}

async function listen(options) {
  const stored = await config();
  const apiKey = String(options["api-key"] || process.env.PAYLOADGRID_API_KEY || stored.apiKey || "");
  const apiUrl = String(options["api-url"] || process.env.PAYLOADGRID_API_URL || stored.apiUrl || "https://payloadgrid.com").replace(/\/$/, "");
  const endpoint = String(options.endpoint || "");
  const destination = String(options.forward || "http://localhost:3000/webhooks");
  if (!apiKey) throw new Error("Run `pg login` or set PAYLOADGRID_API_KEY");
  if (!/^[0-9a-f-]{36}$/i.test(endpoint)) throw new Error("--endpoint must be a PayloadGrid endpoint UUID");
  new URL(destination);

  let cursor = "";
  let first = true;
  let failures = 0;
  console.log(`Listening for ${endpoint}`);
  console.log(`Forwarding to ${destination}. Press Ctrl+C to stop.`);
  while (true) {
    try {
      const query = new URLSearchParams({ endpointId: endpoint, limit: "25" });
      if (cursor) query.set("cursor", cursor);
      else if (options.history) query.set("history", "true");
      const response = await fetch(`${apiUrl}/api/v1/relay/events?${query}`, {
        headers: { authorization: `Bearer ${apiKey}`, "user-agent": "PayloadGrid-CLI/0.1" },
        signal: AbortSignal.timeout(20000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Relay API HTTP ${response.status}`);
      cursor = payload.cursor;
      for (const event of payload.events || []) {
        const result = await forwardEvent(event, destination);
        console.log(result.skipped
          ? `SKIP ${event.eventType} ${event.id.slice(0, 12)} (${result.reason})`
          : `${result.status} POST ${event.eventType} ${event.id.slice(0, 12)}`);
      }
      failures = 0;
      if (options.once && !first) break;
      first = false;
      await new Promise((resolve) => setTimeout(resolve, Number(options.interval || 1000)));
    } catch (error) {
      failures += 1;
      console.error(`Relay error: ${error instanceof Error ? error.message : error}`);
      if (options.once) process.exitCode = 1;
      if (options.once) break;
      await new Promise((resolve) => setTimeout(resolve, Math.min(30000, 1000 * 2 ** Math.min(failures, 5))));
    }
  }
}

const options = args(process.argv.slice(2));
const command = options._[0];
try {
  if (command === "login") await login(options);
  else if (command === "listen") await listen(options);
  else help();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
