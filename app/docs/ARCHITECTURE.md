# PayloadGrid architecture

## Tenant ownership

```text
User -> Organization membership -> Project -> Application -> Endpoint
                                      |             |
                                      |             -> Webhook events -> Delivery attempts
                                      -> API keys
                                      -> Messages
                                      -> Event types / Transformations / Alert rules
```

Every console API resolves the current session and project on the server. Resource creation, listing, replay, and key revocation include the current project or organization in their database query.

## Outbound sequence

1. A customer backend calls `POST /api/v1/messages` with a PayloadGrid API key.
2. PayloadGrid hashes the supplied key and resolves its project.
3. The authenticated key lookup also resolves plan limits; key activity timestamps are written at most once every five minutes per warm runtime.
4. Per-minute API-key and inbound-endpoint limits use 16 counter buckets to avoid serializing concurrent requests on one database row. The response includes `Retry-After` when a fixed minute window is exhausted.
5. A bounded 16-bucket monthly ledger enforces accepted-event capacity without scanning retained message and webhook tables.
6. Application ownership, active transformations, and the published event contract are loaded together. Transformations and non-blocking contract validation run before acceptance.
7. An idempotency key prevents duplicate messages.
8. One database transaction stores the message, creates every matching endpoint delivery, and inserts one dispatch outbox row per delivery.
9. The API returns `202 Accepted`; a background dispatcher publishes pending outbox rows to QStash.
10. Each worker atomically claims a delivery and signs its exact outgoing body.
11. The response, headers, status, body, error, and latency are stored.
12. A failed attempt and its delayed retry outbox row commit together.
13. Alert rules are evaluated against failures in their configured time window.

## Inbound sequence

A provider posts to `/in/:endpointId`. PayloadGrid verifies the untouched raw body, then atomically stores the event and its dispatch outbox row. The request is acknowledged before forwarding. The dispatcher and worker use the same attempt, retry, alert, and dead-letter pipeline as outbound messages.

## Runtime topology and scaling path

Vercel serves the Next.js control plane, public API, inbound routes, outbox dispatcher, and delivery worker route. Neon is the source of truth for accepted messages, endpoint fan-out, dispatch intent, retry state, and attempts. QStash provides signed delivery jobs, delayed execution, request verification, and per-endpoint flow control. Workers claim database events atomically so duplicate queue delivery cannot process one attempt concurrently.

Vercel `after` starts low-latency dispatch after an accepted response, while protected schedules recover pending, stale, or missing outbox work. When QStash is not configured, the dispatcher executes work directly; that mode is suitable for local development, not a production durability promise. At sustained volume requiring continuous consumers, strict ordering, static egress, or infrastructure-independent workers, move dispatch and delivery workers to an always-running service while retaining the control plane and outbox contract.

## Capacity boundary

The public API supports one event per request or bounded batches of at most 100 events, 4 MB per batch, and 256 KB per event. Fan-out is set based, not sequential in application code. Queue publication is decoupled from acceptance through the outbox. These properties remove request-time fan-out as a bottleneck, but throughput claims must come from repeatable load and failure tests against the deployed provider plans. The repository includes k6 profiles under `load/`; no unmeasured requests-per-second or SLA claim is implied.

Accepted-event usage is an append-only monthly ledger: deleting retained payload or delivery records does not restore plan capacity. Simulations and delivery attempts do not increment that ledger. The bucket table is a quota-enforcement optimization, not a replacement for immutable billing-provider records.
