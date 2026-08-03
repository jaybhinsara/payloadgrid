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
3. An idempotency key lookup prevents duplicate messages.
4. Active transformations are applied to the payload.
5. PayloadGrid selects active endpoints for the application and event subscription.
6. Each delivery receives a persistent event ID and endpoint-specific HMAC signature.
7. The response, headers, status, body, error, and latency are stored.
8. Failed deliveries are scheduled using increasing retry intervals.
9. Alert rules are evaluated against failures in their configured time window.

## Inbound sequence

A provider posts to `/in/:endpointId`. PayloadGrid stores the original headers and payload, derives the provider event type and ID, forwards the event to the endpoint destination with a PayloadGrid signature, and uses the same attempt/retry/alert pipeline as outbound messages.

## Runtime topology and scaling path

Vercel serves the Next.js control plane, public API, inbound routes, and delivery worker route. Neon is the source of truth. QStash provides durable delivery jobs, delayed retries, request verification, per-endpoint flow control, and attempt-level deduplication. Workers claim database events atomically so duplicate queue delivery cannot process one attempt concurrently.

The direct Vercel `after` path is a best-effort fallback when QStash publishing is unavailable; it is not the production durability path. At sustained volume that requires continuous consumers, strict ordering, or infrastructure-independent worker availability, move the delivery worker to an always-running service while retaining the Vercel control plane and Neon state model.
