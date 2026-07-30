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

## Scaling path

Vercel route handlers are suitable for the current MVP and early traffic. Before sustained high volume, dispatch delivery jobs to a durable queue such as QStash, Inngest, Trigger.dev, or a dedicated worker service. Neon remains the source of truth; workers should claim jobs atomically and keep all delivery operations idempotent.