import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const accepted = new Rate("payloadgrid_accepted");
const duplicates = new Counter("payloadgrid_duplicates");
const rejected = new Counter("payloadgrid_rejected");
const rateLimited = new Counter("payloadgrid_rate_limited");
const serverErrors = new Counter("payloadgrid_server_errors");
const transportErrors = new Counter("payloadgrid_transport_errors");
const acceptanceLatency = new Trend("payloadgrid_acceptance_latency", true);
const rate = Number(__ENV.RATE || 2);
let loggedFailureSamples = 0;

export function setup() {
  for (const name of ["BASE_URL", "API_KEY", "APPLICATION_ID"]) {
    if (!__ENV[name]) throw new Error(`${name} is required`);
  }
  if (!__ENV.BASE_URL.startsWith("https://")) throw new Error("BASE_URL must use HTTPS");
}

export const options = {
  scenarios: {
    ingestion: {
      executor: "constant-arrival-rate",
      rate,
      timeUnit: "1s",
      duration: __ENV.DURATION || "2m",
      preAllocatedVUs: Math.max(10, rate),
      maxVUs: Math.max(50, rate * 3)
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    payloadgrid_accepted: ["rate>0.99"],
    payloadgrid_acceptance_latency: ["p(95)<1000", "p(99)<2500"]
  }
};

export default function () {
  const sequence = `${__VU}-${__ITER}-${Date.now()}`;
  const runId = __ENV.LOAD_RUN_ID || "manual-load-run";
  const scenario = __ENV.LOAD_SCENARIO || "baseline";
  const response = http.post(`${__ENV.BASE_URL}/api/v1/messages`, JSON.stringify({
    applicationId: __ENV.APPLICATION_ID,
    eventType: `loadtest.${scenario}`,
    payload: { loadRunId: runId, scenario, sequence, sentAt: new Date().toISOString(), size: "bounded" }
  }), { headers: { authorization: `Bearer ${__ENV.API_KEY}`, "content-type": "application/json", "idempotency-key": `${runId}-${sequence}` } });
  const body = response.json();
  const ok = check(response, { "accepted or duplicate": (value) => value.status === 202 || value.status === 200 });
  accepted.add(ok); acceptanceLatency.add(response.timings.duration);
  if (body?.duplicate) duplicates.add(1);
  if (!ok) {
    rejected.add(1, { status: String(response.status || 0) });
    if (response.status === 429) rateLimited.add(1);
    if (response.status >= 500) serverErrors.add(1);
    if (!response.status) transportErrors.add(1);
    if (loggedFailureSamples < 3) {
      console.error(`Rejected request: status=${response.status || 0} body=${String(response.body || "").slice(0, 300)}`);
      loggedFailureSamples += 1;
    }
  }
}
