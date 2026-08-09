import http from "k6/http";
import { check } from "k6";
import { Rate, Trend } from "k6/metrics";

const accepted = new Rate("payloadgrid_inbound_accepted");
const acceptanceLatency = new Trend("payloadgrid_inbound_latency", true);
const rate = Number(__ENV.RATE || 2);

export function setup() {
  for (const name of ["BASE_URL", "ENDPOINT_ID"]) {
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
    payloadgrid_inbound_accepted: ["rate>0.99"],
    payloadgrid_inbound_latency: ["p(95)<1000", "p(99)<2500"]
  }
};

export default function () {
  const sequence = `${__VU}-${__ITER}-${Date.now()}`;
  const response = http.post(`${__ENV.BASE_URL}/in/${__ENV.ENDPOINT_ID}`, JSON.stringify({
    id: `load-${sequence}`,
    type: "loadtest.inbound",
    createdAt: new Date().toISOString(),
    data: { sequence }
  }), { headers: { "content-type": "application/json", "user-agent": "PayloadGrid-k6/1.0" } });
  const ok = check(response, { "inbound accepted": (value) => value.status === 200 || value.status === 202 });
  accepted.add(ok);
  acceptanceLatency.add(response.timings.duration);
}
