# Launch gates

PayloadGrid may be offered to pilot customers only when every applicable gate below has an owner and evidence. Passing repository tests is necessary but does not prove operational reliability or compliance.

## Automated repository gates

Enforced on every pull request and push to `main` by `.github/workflows/application-ci.yml` (see that file for the exact steps):

- `npm ci` succeeds from the committed lockfile.
- `npm run security:audit` reports no vulnerability at or above the configured threshold.
- `npm run typecheck`, `npm test`, and `npm run test:smoke` pass.
- GitHub branch protection requires the Application CI workflow before merging to `main`.

Not run by that shared workflow, because each needs deployment-specific secrets (a live database, an isolated Neon branch, or the production environment's own secret values) that a generic PR pipeline should not hold. Run these manually, or from a separate pipeline scoped to the target environment, before each deployment:

- The target environment passes `npm run config:check` without printing secret values.
- `npm run db:status` reports no pending or modified migration, run against that environment's database.
- The isolated database branch passes `npm run test:integration` with `PAYLOADGRID_TEST_DATABASE_CONFIRM=isolated`.

## Deployment gates

- Existing production schema was reviewed and baselined once; later changes use versioned migrations.
- All protected schedules authenticate successfully and queue age remains below the documented threshold.
- External monitoring checks the public status endpoint and at least one real acceptance path from outside the hosting provider.
- Alerts reach an independently monitored mailbox or incident webhook.
- Rollback instructions identify the last known-good deployment and prohibit destructive database rollback.

## Evidence gates

- Record one isolated database restore with measured RPO and RTO using `docs/DISASTER_RECOVERY.md`.
- Record successful delivery, timeout, `429`, `500`, retry, dead-letter, replay, duplicate, queue interruption, and tenant-isolation exercises.
- Retain sanitized load-test summaries, destination receipts, queue-age measurements, and remediation actions outside the public repository.
- Complete an independent application-security review and remediate high-risk findings.
- Review privacy, retention, subprocessors, terms, support hours, and incident-notification obligations with qualified counsel.

## Commercial gates

- Configure the real legal operator name, business address, tax treatment, invoice process, refund process, and support contact.
- Keep `PAYMENTS_ENABLED=false` until provider approval and a complete test purchase, signature verification, ledger entry, entitlement activation, refund, and reconciliation exercise pass.
- Do not advertise certification, regional residency, static IP, mTLS, enterprise SSO/SCIM, 24/7 support, RPO/RTO, or an SLA until each capability and its evidence exist.
