import http from "k6/http";
import { check } from "k6";

const batchSize = Number(__ENV.BATCH_SIZE || 25);
export function setup() {
  for (const name of ["BASE_URL", "API_KEY", "APPLICATION_ID"]) {
    if (!__ENV[name]) throw new Error(`${name} is required`);
  }
  if (!__ENV.BASE_URL.startsWith("https://")) throw new Error("BASE_URL must use HTTPS");
}
export const options = {
  scenarios: { batches: { executor: "constant-arrival-rate", rate: Number(__ENV.RATE || 2), timeUnit: "1s", duration: __ENV.DURATION || "2m", preAllocatedVUs: 10, maxVUs: 50 } },
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<3000"] }
};

export default function () {
  const events = Array.from({ length: batchSize }, (_, index) => {
    const id = `${__VU}-${__ITER}-${index}-${Date.now()}`;
    return { applicationId: __ENV.APPLICATION_ID, eventType: "loadtest.batch", idempotencyKey: `batch-${id}`, payload: { id } };
  });
  const response = http.post(`${__ENV.BASE_URL}/api/v1/messages/batch`, JSON.stringify({ events }), { headers: { authorization: `Bearer ${__ENV.API_KEY}`, "content-type": "application/json" } });
  check(response, { "batch accepted": (value) => value.status === 202, "all items accepted": () => response.json()?.rejected === 0 });
}
