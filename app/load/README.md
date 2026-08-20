# PayloadGrid capacity tests

These tests are deliberately not run against production automatically. Create an isolated project, application, API key, and endpoint before testing.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\load\run.ps1 -Profile baseline -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile limit -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile batch -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile inbound -BaseUrl https://payloadgrid.com -EndpointId ENDPOINT_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile sustained -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile burst -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile failure -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile recovery -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
```

The guarded runner records a k6 JSON summary, console output, and non-secret metadata under `load/results/`. The included profiles stay within the current 300-request/minute limit: baseline outbound and inbound run at 2 requests/second, limit runs at 5 requests/second, and batch sends 25 events twice per second. The batch profile consumes approximately 3,000 monthly events in one minute.

Run higher rates only in a dedicated production-like deployment after increasing that environment's plan limits and confirming Vercel, Neon, and QStash capacity. Never increase `MaxEvents` without reviewing the expected queue and database cost.

Use `node load/failure-receiver.mjs` behind a temporary HTTPS tunnel to test retries. Set `RESPONSE_STATUS=503`, `429`, or `200`, and use `RESPONSE_DELAY_MS=16000` to test delivery timeouts.

Record acceptance p95/p99, outbox age, delivery lag, database load, QStash publish errors, retry recovery, and missing/duplicate event counts. Do not publish capacity claims until a repeatable run passes.

Every run receives a unique `loadRunId`. To collect end-to-end delivery evidence after the queue has drained, pass a read-only database credential and a wait interval:

```powershell
.\load\run.ps1 -Profile sustained -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST -EvidenceDatabaseUrl $env:LOAD_TEST_READONLY_DATABASE_URL -EvidenceWaitSeconds 180
```

The evidence file separates accepted deliveries, delivered events, pending work, retries, dead letters, destination latency, attempts, and duplicate attempt numbers. A run is complete only when the evidence shows the expected terminal state, not merely when the API accepted every request.

For `failure`, point the isolated application at the controlled failure receiver and return `429`, `503`, or a timeout. For `recovery`, change that same receiver to `200` without deleting queued events, then record the recovery run and final evidence. Never use a third-party free request catcher for capacity evidence.
