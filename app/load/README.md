# PayloadGrid capacity tests

These tests are deliberately not run against production automatically. Create an isolated project, application, API key, and endpoint before testing.

```bash
k6 run -e BASE_URL=https://payloadgrid.com -e API_KEY=pg_live_... -e APPLICATION_ID=... -e RATE=10 load/k6/messages.js
k6 run -e BASE_URL=https://payloadgrid.com -e API_KEY=pg_live_... -e APPLICATION_ID=... -e RATE=2 -e BATCH_SIZE=25 load/k6/batch.js
```

Repeat the message test at `RATE=10`, `RATE=100`, and `RATE=500` only after raising the test project's rate limit. The current Free plan correctly rejects traffic above five API requests per second.

Use `node load/failure-receiver.mjs` behind a temporary HTTPS tunnel to test retries. Set `RESPONSE_STATUS=503`, `429`, or `200`, and use `RESPONSE_DELAY_MS=16000` to test delivery timeouts.

Record acceptance p95/p99, outbox age, delivery lag, database load, QStash publish errors, retry recovery, and missing/duplicate event counts. Do not publish capacity claims until a repeatable run passes.
