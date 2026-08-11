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
  pg tail --endpoint UUID [--event-type order.created] [--direction inbound] [--history]
  pg inspect --endpoint UUID --event-id UUID
  pg types --application UUID --language typescript|python [--out events.ts]

The API key used by listen, tail, inspect, and types must include the events:read scope.`);
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

async function credentials(options) {
  const stored = await config();
  const apiKey = String(options["api-key"] || process.env.PAYLOADGRID_API_KEY || stored.apiKey || "");
  const apiUrl = String(options["api-url"] || process.env.PAYLOADGRID_API_URL || stored.apiUrl || "https://payloadgrid.com").replace(/\/$/, "");
  if (!apiKey) throw new Error("Run `pg login` or set PAYLOADGRID_API_KEY");
  return { apiKey, apiUrl };
}

async function listen(options, mode = "forward") {
  const { apiKey, apiUrl } = await credentials(options);
  const endpoint = String(options.endpoint || "");
  const destination = String(options.forward || "http://localhost:3000/webhooks");
  if (!/^[0-9a-f-]{36}$/i.test(endpoint)) throw new Error("--endpoint must be a PayloadGrid endpoint UUID");
  if (mode === "forward") new URL(destination);

  let cursor = "";
  let failures = 0;
  console.log(`Listening for ${endpoint}`);
  console.log(mode === "forward" ? `Forwarding to ${destination}. Press Ctrl+C to stop.` : "Live tail active. Press Ctrl+C to stop.");
  while (true) {
    try {
      const query = new URLSearchParams({ endpointId: endpoint, limit: "25" });
      if (cursor) query.set("cursor", cursor);
      else if (options.history) query.set("history", "true");
      if (options["event-type"]) query.set("eventType", String(options["event-type"]));
      if (options.direction) query.set("direction", String(options.direction));
      if (options["event-id"]) query.set("eventId", String(options["event-id"]));
      const response = await fetch(`${apiUrl}/api/v1/relay/events?${query}`, {
        headers: { authorization: `Bearer ${apiKey}`, "user-agent": "PayloadGrid-CLI/0.1" },
        signal: AbortSignal.timeout(20000)
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `Relay API HTTP ${response.status}`);
      cursor = payload.cursor;
      for (const event of payload.events || []) {
        if (mode === "tail" || mode === "inspect") console.log(`${event.receivedAt} ${event.direction.toUpperCase()} ${event.status.toUpperCase()} ${event.eventType} ${event.id}\n${options.json ? JSON.stringify(event) : typeof event.body === "string" ? event.body : JSON.stringify(event.body)}`);
        else { const result = await forwardEvent(event, destination); console.log(result.skipped ? `SKIP ${event.eventType} ${event.id.slice(0, 12)} (${result.reason})` : `${result.status} POST ${event.eventType} ${event.id.slice(0, 12)}`); }
      }
      failures = 0;
      if (options.once) break;
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

function typeName(eventName) { return eventName.split(/[^a-zA-Z0-9]+/).filter(Boolean).map((part) => part[0].toUpperCase() + part.slice(1)).join("") + "Event"; }
function tsType(schema) { if (schema?.type === "string") return "string"; if (schema?.type === "number" || schema?.type === "integer") return "number"; if (schema?.type === "boolean") return "boolean"; if (schema?.type === "array") return `${tsType(schema.items)}[]`; if (schema?.type === "object" || schema?.properties) { const required=new Set(schema.required||[]); return `{ ${Object.entries(schema.properties||{}).map(([key,value])=>`${JSON.stringify(key)}${required.has(key)?"":"?"}: ${tsType(value)}`).join("; ")} }`; } return "unknown"; }
function pyType(schema) { if (schema?.type === "string") return "str"; if (schema?.type === "number") return "float"; if (schema?.type === "integer") return "int"; if (schema?.type === "boolean") return "bool"; if (schema?.type === "array") return `list[${pyType(schema.items)}]`; return "dict[str, Any]"; }
async function generateTypes(options) { const {apiKey,apiUrl}=await credentials(options); const application=String(options.application||""); if(!/^[0-9a-f-]{36}$/i.test(application))throw new Error("--application must be a UUID"); const language=String(options.language||"typescript"); const response=await fetch(`${apiUrl}/api/v1/contracts?applicationId=${application}`,{headers:{authorization:`Bearer ${apiKey}`}}); const body=await response.json(); if(!response.ok)throw new Error(body.error||"Could not load contracts"); let output; if(language==="python") output=`from typing import Any, TypedDict\n\n${body.contracts.map(contract=>`class ${typeName(contract.name)}(TypedDict):\n    payload: ${pyType(contract.schema)}\n    event_type: str`).join("\n\n")}\n`; else output=body.contracts.map(contract=>`export type ${typeName(contract.name)} = { eventType: ${JSON.stringify(contract.name)}; payload: ${tsType(contract.schema)} };`).join("\n\n")+"\n"; if(options.out){await writeFile(String(options.out),output);console.log(`Generated ${body.contracts.length} event types in ${options.out}`);}else console.log(output); }

const options = args(process.argv.slice(2));
const command = options._[0];
try {
  if (command === "login") await login(options);
  else if (command === "listen") await listen(options);
  else if (command === "tail") await listen(options, "tail");
  else if (command === "inspect") { options.history=true; options.once=true; await listen(options,"inspect"); }
  else if (command === "types") await generateTypes(options);
  else help();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
