# PayloadGrid capacity tests

These tests are deliberately not run against production automatically. Create an isolated project, application, API key, and endpoint before testing.

```powershell
Set-ExecutionPolicy -Scope Process Bypass
.\load\run.ps1 -Profile baseline -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile limit -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile batch -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile inbound -BaseUrl https://payloadgrid.com -EndpointId ENDPOINT_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile sustained -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile starter-burst -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile burst -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile noisy-neighbor -BaseUrl https://payloadgrid.com -ApiKey NOISY_WORKSPACE_KEY -ApplicationId NOISY_APPLICATION_UUID -ControlApiKey CONTROL_WORKSPACE_KEY -ControlApplicationId CONTROL_APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile failure -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
.\load\run.ps1 -Profile recovery -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST
```

The guarded runner records a k6 JSON summary, console output, and non-secret metadata under `load/results/`. Baseline outbound and inbound run at 2 requests/second, limit runs at 5 requests/second, and batch sends 25 events twice per second. Sustained runs at 10 requests/second. Starter burst peaks at 15 requests/second and schedules approximately 960 requests, remaining within the Starter API-key allowance. The unrestricted burst ramps from 5 to 50 requests/second and back over two minutes, scheduling approximately 3,300 requests. Those higher-rate profiles require a test workspace whose plan, temporary monthly capacity, queue quota, and destination rate are all high enough. The batch profile consumes approximately 3,000 monthly events in one minute.

Burst evidence includes separate counters for `429` rate limits, `5xx` responses, transport failures, and total rejected requests. A Starter key is limited to 1,000 API requests per minute, so the 50 requests/second burst is expected to cross that limit. Use an isolated Growth-or-higher test workspace when measuring 50 requests/second ingestion capacity rather than rate-limit behavior.

The `noisy-neighbor` profile proves logical tenant isolation with two separate workspaces. The noisy workspace follows the Starter-safe 15 requests/second burst while the control workspace remains steady at 2 requests/second. It fails if the control tenant is rate limited, receives a server error, falls below 99% acceptance, or exceeds its latency thresholds. Both applications must have independent destinations, and both keys must belong to different workspaces. Do not reuse the same application or key for both roles.

Run higher rates only in a dedicated production-like deployment after increasing that environment's plan limits and confirming Vercel, Neon, and QStash capacity. Never increase `MaxEvents` without reviewing the expected queue and database cost.

Use `node load/failure-receiver.mjs` behind a temporary HTTPS tunnel to test retries. Set `RESPONSE_STATUS=503`, `429`, or `200`, and use `RESPONSE_DELAY_MS=16000` to test delivery timeouts.

Record acceptance p95/p99, outbox age, delivery lag, database load, QStash publish errors, retry recovery, and missing/duplicate event counts. Do not publish capacity claims until a repeatable run passes.

Every run receives a unique `loadRunId`. To collect end-to-end delivery evidence after the queue has drained, pass a read-only database credential and a wait interval:

```powershell
.\load\run.ps1 -Profile sustained -BaseUrl https://payloadgrid.com -ApiKey pg_live_... -ApplicationId APPLICATION_UUID -IsolatedProject -Approval I_APPROVE_LOAD_TEST -EvidenceDatabaseUrl $env:LOAD_TEST_READONLY_DATABASE_URL -EvidenceWaitSeconds 180
```

The evidence file separates accepted deliveries, delivered events, pending work, retries, dead letters, destination latency, attempts, and duplicate attempt numbers. For the noisy-neighbor profile it also records delivery state and lifecycle latency independently for the noisy and control tenants. A run is complete only when both tenant queues reach the expected terminal state, not merely when the API accepted every request.

For `failure`, point the isolated application at the controlled failure receiver and return `429`, `503`, or a timeout. For `recovery`, change that same receiver to `200` without deleting queued events, then record the recovery run and final evidence. Never use a third-party free request catcher for capacity evidence.
