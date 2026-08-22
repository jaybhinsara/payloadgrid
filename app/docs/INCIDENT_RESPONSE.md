# Incident response

This runbook covers production availability, security, privacy, queue, and data-integrity incidents. It does not replace external monitoring or a staffed support commitment.

## Severity

- SEV-1: confirmed data exposure, cross-tenant access, destructive data loss, or platform-wide delivery failure.
- SEV-2: sustained delivery degradation, growing unrecoverable backlog, authentication outage, or one major customer unavailable.
- SEV-3: limited degradation with a working recovery path and no confirmed security impact.

## First 15 minutes

1. Assign an incident commander and record the UTC start time.
2. Create an incident identifier and an evidence folder outside the source repository.
3. Preserve relevant deployment, database, queue, authentication, audit, and edge logs. Do not paste secrets or payload bodies into support notes.
4. Stop the unsafe action: pause the affected workspace, disable a route, revoke a key, or roll back the deployment.
5. Determine affected workspaces, event time range, data categories, and whether tenant isolation or integrity is at risk.
6. Publish a factual status update when customer impact is confirmed. Do not estimate recovery until a recovery path is verified.

## Recovery

1. Prefer replay from the transactional outbox or retained delivery record over manually rebuilding payloads.
2. Validate a fix in an isolated project before resuming customer traffic.
3. Resume one workspace or endpoint first and observe acceptance, queue age, attempt status, and destination responses.
4. Expand recovery gradually. Keep duplicate prevention and rate limits enabled.
5. For data recovery, follow `docs/DISASTER_RECOVERY.md` and restore only into an isolated database.

## Communication and closure

Record detection time, acknowledgement time, mitigation time, recovery time, affected tenants, customer updates, data impact, root cause, contributing controls, and evidence links. Close only after backlog age is normal, failed work is reconciled, alerts are green, and the owner accepts follow-up actions.

Within five business days, complete a blameless review with corrective actions, owners, due dates, and a regression test. Security or personal-data incidents require legal review against applicable notification deadlines.
