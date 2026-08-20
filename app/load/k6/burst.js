import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const accepted = new Rate("payloadgrid_burst_accepted");
const rejected = new Counter("payloadgrid_burst_rejected");
const rateLimited = new Counter("payloadgrid_burst_rate_limited");
const serverErrors = new Counter("payloadgrid_burst_server_errors");
const transportErrors = new Counter("payloadgrid_burst_transport_errors");
const latency = new Trend("payloadgrid_burst_latency", true);
const peak = Number(__ENV.RATE || 50);
let loggedFailureSamples = 0;

export function setup() {
  for (const name of ["BASE_URL", "API_KEY", "APPLICATION_ID", "LOAD_RUN_ID"]) {
    if (!__ENV[name]) throw new Error(`${name} is required`);
  }
}

export const options = {
  scenarios: {
    burst: {
      executor: "ramping-arrival-rate",
      startRate: Math.max(1, Math.floor(peak / 10)),
      timeUnit: "1s",
      preAllocatedVUs: Math.max(20, peak),
      maxVUs: Math.max(100, peak * 3),
      stages: [
        { target: Math.max(1, Math.floor(peak / 10)), duration: "30s" },
        { target: peak, duration: "15s" },
        { target: peak, duration: "30s" },
        { target: Math.max(1, Math.floor(peak / 10)), duration: "45s" }
      ]
    }
  },
  thresholds: {
    payloadgrid_burst_accepted: ["rate>0.99"],
    payloadgrid_burst_latency: ["p(95)<1500", "p(99)<3000"]
  }
};

export default function () {
  const sequence = `${__VU}-${__ITER}-${Date.now()}`;
  const response = http.post(`${__ENV.BASE_URL}/api/v1/messages`, JSON.stringify({
    applicationId: __ENV.APPLICATION_ID,
    eventType: "loadtest.burst",
    payload: { loadRunId: __ENV.LOAD_RUN_ID, scenario: "burst", sequence, sentAt: new Date().toISOString() }
  }), { headers: { authorization: `Bearer ${__ENV.API_KEY}`, "content-type": "application/json", "idempotency-key": `${__ENV.LOAD_RUN_ID}-${sequence}` } });
  const ok = check(response, { "burst request accepted": (value) => value.status === 202 || value.status === 200 });
  accepted.add(ok);
  latency.add(response.timings.duration);
  if (!ok) {
    rejected.add(1, { status: String(response.status || 0) });
    if (response.status === 429) rateLimited.add(1);
    if (response.status >= 500) serverErrors.add(1);
    if (!response.status) transportErrors.add(1);
    if (__VU <= 3 && loggedFailureSamples < 1) {
      console.error(`Rejected burst request: status=${response.status || 0} body=${String(response.body || "").slice(0, 300)}`);
      loggedFailureSamples += 1;
    }
  }
}
