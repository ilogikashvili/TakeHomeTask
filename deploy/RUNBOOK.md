# Release and recovery runbook

The templates in this directory have not been run with Docker or on a public host. They are reviewable deployment inputs, not evidence of a deployed service.

## Configuration and identity

Use a maintained PostgreSQL 18 host with encrypted connections and backups. Create separate roles: a migration owner, a runtime role with SELECT/INSERT/UPDATE/DELETE only, and an assistant role with SELECT only on LineItem, Vendor and Owner. Grant schema USAGE and required sequence permissions. Apply migrations as the migration owner; grant runtime access to every new table after migration. Neither application role should be a superuser or have CREATE privileges. Never run the development seed against production.

Copy `production.env.example` to `backend/.env.production`, replace placeholders through the host's secret manager, and restrict access to the resulting file. Set `PUBLIC_HOST` and `MIGRATION_DATABASE_URL` in the deployment environment. DNS must point at the host and ports 80/443 must be reachable for Caddy certificate issuance. The database must accept traffic only from authorized application/administrative networks. Apply an ingress IP request/connection limit; application quotas apply after authentication and do not replace edge abuse protection.

Production demo login is always disabled. A trusted identity system must issue HS256 tokens containing `kid`, `iss`, `aud`, unique UUID `jti`, `sub`, `role`, `iat`, `exp` and an existing Owner UUID in `ownerId` for every mutating identity, including administrators. Token lifetime is at most 15 minutes; this application has no refresh-token endpoint. Reauthentication belongs to the identity system. It must authorize role/owner claims rather than accept them from users. Integration with that system remains a release gate.

For rotation, deploy an overlapping `AUTH_JWT_KEYS` map to all instances, switch the issuer and active signing key, wait at least 15 minutes, then remove the old key everywhere. Emergency retirement removes the compromised key immediately. HTTP logout persists `jti` revocation; active sockets check revocation every 15 seconds and disconnect at token expiry. Operations endpoints require administrator authorization.

## Release sequence

1. Require green CI, dependency audits, a reviewed migration and an immutable recorded image digest. Build both images with `docker compose -f deploy/compose.yaml build`.
2. Take and verify a database backup. Run `docker compose -f deploy/compose.yaml --profile maintenance run --rm migrate` with the separate migration connection, then apply role grants.
3. Run `docker compose -f deploy/compose.yaml up -d backend web`. Confirm readiness and inspect container logs. Keep the prior image digest available.
4. Test HTTPS, SPA deep links, authenticated ledger CRUD/export, SSE progress/results, live reminder reception, logout and socket expiry through the public hostname. Confirm demo routes return 404 in production and foreign-owner reads/writes are rejected.
5. Rehearse a restart and reconnect while preserving persisted notifications. Record deployment ID, image digests, schema version and operator.

On failure, stop rollout. For a backward-compatible migration, redeploy the prior immutable image. Do not invent down migrations or reset a live database. An incompatible schema rollback requires maintenance mode, a tested restoration or reviewed forward repair, and explicit accounting for writes since the backup.

## Backups and restoration

Use the host's scheduled encrypted backup/PITR service with restricted off-host storage. Agree RPO, RTO and retention with the data owner before launch. Monitor backup age and failures. A local dump is not a production backup schedule.

The local drill is `node scripts/restore-drill.cjs` from backend after E2E setup. It dumps only the isolated `_e2e` database, restores into a newly created unique database, compares every public table's row count/content digest, and removes only that verification database. Set `TEST_DATABASE_ADMIN_URL` and optionally `PG_BIN`. Archives remain in ignored `backend/test-results`; restrict access and expire them. The script never restores into an existing database.

For production rehearsal, restore an encrypted backup into a separate restricted environment using `pg_restore --exit-on-error --no-owner --no-acl`, recreate the intended role grants, and run readiness plus representative ledger/approval/reminder checks. Measure actual recovery time and recovery point. Record and review the results against the agreed targets before enabling traffic.

## Monitoring and incident response

Poll `/api/health/ready` every 30 seconds. `/api/health` is liveness only. Scrape authenticated `/api/ops/metrics` on every instance: requests, errors, cumulative duration, uptime and RSS. Counters reset on process restart and exclude guard failures; derive latency/error rates from ingress telemetry and retain structured application logs centrally. Configure alerts for readiness failures, elevated 5xx/latency, quota spikes, DB pool saturation, backup age and reminder scheduling failures. Container logs rotate at 5 × 10 MB; centralized retention and alert routing must be configured by the host operator.

On an alert, record time/request IDs, check readiness and database capacity, inspect redacted logs and recent releases, and roll back a compatible application release when appropriate. Assign an actual on-call owner and rehearse this procedure; the repository does not establish operational coverage.

## Product and data policy

The implemented policy allows owners to approve their own items; admins can manage all items. Mutation audit actors always equal the verified `ownerId`. Reassignment transfers notifications while preserving dismissal/read state. Deleted items disappear from unread reminders. Notification storage is durable; live push is best effort with polling/reconnect recovery. Guaranteed external delivery would require an outbox and delivery worker.

Spend means listed billing amounts or annualized recurring run rate, not historical payments. Conversations are capped at 100 messages and questions at 2,000 characters. Retention deletion is off by default; obtain data-owner approval before setting `RETENTION_ENABLED=true` (default 90 days). This removes old conversations and query audits, not approval history. Expired quota and revocation entries are pruned hourly regardless.

Gemini remains optional and disabled without both settings. If enabled, the question is sent to the configured provider; the provider returns a validated intent, never executable SQL. The data owner must approve this processing and live evaluations/outage tests must pass before releasing that option.
