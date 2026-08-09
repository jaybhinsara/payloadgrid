# PayloadGrid capacity tests

These tests are deliberately not run against production automatically. Create an isolated project, application, API key, and endpoint before testing.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\load\run.ps1 -Profile baseline -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile limit -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile batch -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile inbound -BaseUrl https://payloadgrid.com -EndpointId ENDPOINT_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
```

The guarded runner records a k6 JSON summary, console output, and non-secret metadata under `load/results/`. The included profiles stay within the current 300-request/minute limit: baseline outbound and inbound run at 2 requests/second, limit runs at 5 requests/second, and batch sends 25 events twice per second. The batch profile consumes approximately 3,000 monthly events in one minute.

Run higher rates only in a dedicated production-like deployment after increasing that environment's plan limits and confirming Vercel, Neon, and QStash capacity. Never increase `MaxEvents` without reviewing the expected queue and database cost.

Use `node load/failure-receiver.mjs` behind a temporary HTTPS tunnel to test retries. Set `RESPONSE_STATUS=503`, `429`, or `200`, and use `RESPONSE_DELAY_MS=16000` to test delivery timeouts.

Record acceptance p95/p99, outbox age, delivery lag, database load, QStash publish errors, retry recovery, and missing/duplicate event counts. Do not publish capacity claims until a repeatable run passes.
