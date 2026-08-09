# PayloadGrid production baseline

## Test identity

- Date: August 9, 2026
- Target: `https://payloadgrid.com`
- Profile: outbound baseline
- Isolation: dedicated load-test project and application
- Duration: 2 minutes
- Arrival rate: 2 requests per second
- Tool: k6 through the guarded `load/run.ps1` runner

## API acceptance results

| Measurement | Result |
| --- | ---: |
| Requests | 241 |
| Accepted requests | 241 |
| Failed API requests | 0 |
| Acceptance rate | 100% |
| Average acceptance latency | 266.79 ms |
| p95 acceptance latency | 359.81 ms |
| Maximum acceptance latency | 536.72 ms |

All API requests satisfied the baseline acceptance checks. The measured p95 remained below the profile's 1,000 ms threshold.

## Destination evidence

The free webhook.site receiver admitted 50 destination requests and returned HTTP 200 for all 50. After its allowance was exhausted, it returned HTTP 429. PayloadGrid recorded 570 HTTP 429 delivery attempts as automatic retries ran. The affected test deliveries were subsequently cancelled and retained in delivery history.

This receiver limitation means the run validates production API ingestion and retry behavior. It does not establish that all 241 events completed asynchronous destination delivery, maximum platform throughput, contractual availability, or an SLA.

## Publishable statement

> Production baseline: 241 of 241 API requests accepted with 100% ingestion success and 360 ms p95 acceptance latency.

Any public use of these results must retain the word `baseline`, identify the metric as API acceptance, and must not describe the run as a capacity limit or SLA.
