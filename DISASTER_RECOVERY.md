# Disaster Recovery

## Targets

The data owner must approve RPO, RTO and retention before production. Until those values are approved, the system is not release-approved for real financial data.

## Backup policy

Use scheduled encrypted PostgreSQL backups or PITR with restricted off-server storage. Monitor backup age and failures. Retain backups according to the approved data-retention policy and test access without exposing credentials.

## Restore procedure

1. Stop writes or isolate the affected environment.
2. Provision a separate restricted restore database.
3. Restore the encrypted backup with `pg_restore --exit-on-error --no-owner --no-acl`.
4. Recreate role grants and apply any required compatible migrations.
5. Run readiness, ledger, approval, reminder and authorization smoke checks.
6. Measure recovery time and identify the restore point, then record the result against approved RPO/RTO.
7. Promote only after data-owner approval; retain the original database for forensic review.

The repository's local `backend/scripts/restore-drill.cjs` performs a non-destructive isolated E2E dump/restore and compares every public-table digest. It is verification evidence, not a production backup schedule.

## Incidents

For corruption, credential compromise or destructive errors, stop rollout, revoke compromised tokens/keys, preserve logs and snapshots, restrict access, restore into isolation, validate authorization and data integrity, and document writes lost or replayed. Do not reset or overwrite a live database without an approved recovery plan.
