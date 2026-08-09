import http from "k6/http";
import { check } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";

const accepted = new Rate("payloadgrid_accepted");
const duplicates = new Counter("payloadgrid_duplicates");
const acceptanceLatency = new Trend("payloadgrid_acceptance_latency", true);
const rate = Number(__ENV.RATE || 10);

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
  const response = http.post(`${__ENV.BASE_URL}/api/v1/messages`, JSON.stringify({
    applicationId: __ENV.APPLICATION_ID,
    eventType: "loadtest.message",
    payload: { sequence, sentAt: new Date().toISOString(), size: "bounded" }
  }), { headers: { authorization: `Bearer ${__ENV.API_KEY}`, "content-type": "application/json", "idempotency-key": `load-${sequence}` } });
  const body = response.json();
  const ok = check(response, { "accepted or duplicate": (value) => value.status === 202 || value.status === 200 });
  accepted.add(ok); acceptanceLatency.add(response.timings.duration);
  if (body?.duplicate) duplicates.add(1);
}
