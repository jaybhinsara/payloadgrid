import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const noisyAccepted = new Rate("payloadgrid_noisy_tenant_accepted");
const noisyLatency = new Trend("payloadgrid_noisy_tenant_latency", true);
const noisyRateLimited = new Counter("payloadgrid_noisy_tenant_rate_limited");
const noisyServerErrors = new Counter("payloadgrid_noisy_tenant_server_errors");
const controlAccepted = new Rate("payloadgrid_control_tenant_accepted");
const controlLatency = new Trend("payloadgrid_control_tenant_latency", true);
const controlRateLimited = new Counter("payloadgrid_control_tenant_rate_limited");
const controlServerErrors = new Counter("payloadgrid_control_tenant_server_errors");

const noisyPeak = Number(__ENV.RATE || 15);
const controlRate = Number(__ENV.CONTROL_RATE || 2);

export function setup() {
  for (const name of [
    "BASE_URL", "API_KEY", "APPLICATION_ID", "CONTROL_API_KEY",
    "CONTROL_APPLICATION_ID", "LOAD_RUN_ID"
  ]) {
    if (!__ENV[name]) throw new Error(`${name} is required`);
  }
  if (!__ENV.BASE_URL.startsWith("https://")) throw new Error("BASE_URL must use HTTPS");
  if (__ENV.API_KEY === __ENV.CONTROL_API_KEY) {
    throw new Error("Noisy and control tenants must use different API keys");
  }
  if (__ENV.APPLICATION_ID === __ENV.CONTROL_APPLICATION_ID) {
    throw new Error("Noisy and control tenants must use different applications");
  }
}

export const options = {
  scenarios: {
    noisy_tenant: {
      executor: "ramping-arrival-rate",
      exec: "sendNoisyTenant",
      startRate: Math.max(1, Math.floor(noisyPeak / 10)),
      timeUnit: "1s",
      preAllocatedVUs: Math.max(20, noisyPeak),
      maxVUs: Math.max(100, noisyPeak * 3),
      stages: [
        { target: Math.max(1, Math.floor(noisyPeak / 10)), duration: "30s" },
        { target: noisyPeak, duration: "15s" },
        { target: noisyPeak, duration: "30s" },
        { target: Math.max(1, Math.floor(noisyPeak / 10)), duration: "45s" }
      ]
    },
    control_tenant: {
      executor: "constant-arrival-rate",
      exec: "sendControlTenant",
      rate: controlRate,
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: Math.max(5, controlRate),
      maxVUs: Math.max(20, controlRate * 3)
    }
  },
  thresholds: {
    payloadgrid_noisy_tenant_accepted: ["rate>0.99"],
    payloadgrid_noisy_tenant_latency: ["p(95)<1500", "p(99)<3000"],
    payloadgrid_noisy_tenant_server_errors: ["count==0"],
    payloadgrid_control_tenant_accepted: ["rate>0.99"],
    payloadgrid_control_tenant_latency: ["p(95)<1000", "p(99)<2500"],
    payloadgrid_control_tenant_rate_limited: ["count==0"],
    payloadgrid_control_tenant_server_errors: ["count==0"]
  }
};

function send(role, apiKey, applicationId, accepted, latency, rateLimited, serverErrors) {
  const sequence = `${role}-${__VU}-${__ITER}-${Date.now()}`;
  const response = http.post(`${__ENV.BASE_URL}/api/v1/messages`, JSON.stringify({
    applicationId,
    eventType: `loadtest.noisy-neighbor.${role}`,
    payload: {
      loadRunId: __ENV.LOAD_RUN_ID,
      scenario: "noisy-neighbor",
      tenantRole: role,
      sequence,
      sentAt: new Date().toISOString()
    }
  }), {
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
      "idempotency-key": `${__ENV.LOAD_RUN_ID}-${sequence}`
    },
    tags: { tenant_role: role }
  });

  const ok = check(response, { [`${role} tenant accepted`]: (value) => value.status === 202 || value.status === 200 });
  accepted.add(ok);
  latency.add(response.timings.duration);
  if (response.status === 429) rateLimited.add(1);
  if (response.status >= 500) {
    serverErrors.add(1);
    console.error(`${role} tenant server error: status=${response.status} body=${String(response.body || "").slice(0, 300)}`);
  }
}

export function sendNoisyTenant() {
  send("noisy", __ENV.API_KEY, __ENV.APPLICATION_ID, noisyAccepted, noisyLatency, noisyRateLimited, noisyServerErrors);
}

export function sendControlTenant() {
  send(
    "control", __ENV.CONTROL_API_KEY, __ENV.CONTROL_APPLICATION_ID,
    controlAccepted, controlLatency, controlRateLimited, controlServerErrors
  );
}
