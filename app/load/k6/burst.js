import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const accepted = new Rate("payloadgrid_burst_accepted");
const latency = new Trend("payloadgrid_burst_latency", true);
const peak = Number(__ENV.RATE || 50);

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
}
