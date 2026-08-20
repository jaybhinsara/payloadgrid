# PayloadGrid backup and disaster recovery

This runbook validates that accepted data can be restored and that durable delivery work can be reconciled. It does not modify production and it must never be used to overwrite the production database.

## Recovery objectives

Do not publish an RPO or RTO until repeated exercises establish them. For each exercise, record:

- the selected restore point and the newest record present after restoration;
- the time from declaring the exercise to a verified restored database;
- event, attempt, and dispatch counts before and after restoration;
- orphaned foreign-key relationships or missing schema objects;
- pending deliveries that need dispatch reconciliation;
- the time required to resume delivery in the isolated environment.

## Capture a baseline

Use a read-only production credential. The command records counts, timestamps, and relationship checks; it does not read payload bodies or credentials.

```powershell
$env:RECOVERY_DATABASE_URL = $env:PRODUCTION_READONLY_DATABASE_URL
$env:RECOVERY_EVIDENCE_FILE = "recovery-baseline-2026-08-20.json"
$env:RECOVERY_APPROVAL = "I_APPROVE_READ_ONLY_RECOVERY_CHECK"
npm run recovery:capture
```

The output file is operational evidence. Store it in restricted incident storage, not in Git.

## Restore without touching production

1. Select a recorded restore point in the database provider.
2. Restore it into a new isolated database or branch.
3. create a separate application deployment that uses only the restored database.
4. Disable public ingress and outbound dispatch in that deployment initially.
5. Apply the current idempotent `db/schema.sql` only if the restored point predates the current schema.
6. Verify the restoration before enabling any worker.

## Verify the restored database

```powershell
$env:RECOVERY_DATABASE_URL = $env:RESTORED_DATABASE_URL
$env:RECOVERY_EVIDENCE_FILE = "recovery-baseline-2026-08-20.json"
$env:RECOVERY_APPROVAL = "I_APPROVE_READ_ONLY_RECOVERY_CHECK"
npm run recovery:verify
```

Verification fails when a restored table contains fewer records than the baseline or when an orphan relationship is detected. A point-in-time restore older than the baseline will correctly fail; capture the expected restore-point manifest when testing a historical RPO.

## Reconcile delivery work

The database outbox is the source of truth. External queue state is not assumed to be restored with the database.

1. Keep delivery paused for every restored workspace.
2. Inspect pending, publishing, and published `dispatch_jobs` and their matching event attempts.
3. Run the protected stale-job recovery path in the isolated deployment.
4. Confirm deduplication prevents concurrent processing of one delivery attempt.
5. Route destinations to a controlled receiver, not real customer endpoints.
6. Resume one test workspace and verify queued, retrying, and dead-letter behavior.
7. Confirm queue depth returns to zero and no duplicate attempt numbers exist.

## Exercise record

Record the date, operator, restore point, provider incident simulated, measured RPO, measured RTO, failed checks, remediation owner, and follow-up date. Repeat after material queue, schema, authentication, or hosting changes and at least quarterly once contractual reliability is offered.
