# PayloadGrid production readiness

This register separates capabilities implemented in the repository from operational or contractual claims that require external evidence. Review it before enabling a paid production customer.

## Implemented in the product

- Transactional message fan-out and dispatch outbox in Neon.
- Asynchronous QStash delivery with signed workers, deduplication, delayed retries, and stale-job recovery.
- Bounded batch intake: 100 events, 4 MB per request, and 256 KB per event.
- Atomic worker claims, attempt history, replay, simulation, dead-letter resolution, and archive history.
- Project-scoped API keys with `messages:write` and `events:read` scopes.
- Raw-body provider verification and HMAC signing for customer destinations.
- Twenty-four-hour dual-signature secret rotation.
- AES-256-GCM encryption for provider secrets and destination authorization headers.
- SSRF protections, HTTPS enforcement, rate limits, idempotency, retention, audit logs, and role checks.
- Permission-scoped embedded history and a React iframe wrapper.
- Published npm relay CLI plus source-ready TypeScript, Python, and React embed packages.
- Public component monitoring, incident history, and operator notifications.
- Repeatable k6 intake profiles and a controllable failure receiver under `load/`.

## Required deployment configuration

1. Run the complete idempotent `db/schema.sql` against production Neon.
2. Configure QStash and protected schedules for `/api/cron/dispatch`, `/api/cron/retry-failed`, `/api/cron/maintenance`, and `/api/cron/monitor`.
3. Keep encryption, cron, OAuth, email, and queue secrets in Vercel server-only variables.
4. Test successful delivery, retry, dead-letter recovery, secret rotation, and stale dispatch recovery.
5. Monitor Vercel, Neon, QStash, and email quotas independently of PayloadGrid counters.

## Evidence gates before reliability claims

- Run k6 at agreed target and burst rates in an isolated project. Record API latency, outbox age, queue delay, delivery latency, failure rate, and database utilization.
- Test destination timeouts, `429`, `500`, queue interruption, duplicate callbacks, and worker interruption.
- Perform and record a Neon backup restore exercise.
- Publish the TypeScript, Python, and React embed packages before advertising their install commands as generally available.
- Establish external uptime monitoring and enough history for any displayed reliability percentage.
- Complete security, dependency, incident-response, privacy, legal, and data-processing reviews.
- Define support hours, recovery objectives, retention obligations, and exclusions before offering an SLA.
- Complete an independent audit before displaying certification language.

## Not implemented in this phase

- Regional data planes and contractual data residency. This is deliberately deferred.
- Static outbound IP addresses, private networking, or allow-list infrastructure.
- Mutual TLS destinations.
- Enterprise SAML/OIDC SSO and automated SCIM provisioning.
- Native SQS, EventBridge, Pub/Sub, or Kafka destinations. The adapter boundary exists, but each transport still needs credential, retry, and delivery-semantics design.
- Published npm/PyPI distributions for the source-ready TypeScript, Python, and React embed packages.
- A contractual SLA or compliance certification.

These are not UI switches. They require provider provisioning, security and legal work, operational ownership, and measured evidence. PayloadGrid must not market them as available until those dependencies are complete.
