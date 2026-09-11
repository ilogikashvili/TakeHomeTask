# Release and recovery runbook

The templates in this directory have not been run with Docker or on a public host. They are reviewable deployment inputs, not evidence of a deployed service.

## Configuration and identity

Use maintained PostgreSQL 18 with encrypted connections and backups. The version decision and exact role audit are recorded in [DEPLOYMENT_CONTRACT.md](DEPLOYMENT_CONTRACT.md). CI already targets 18, local verification uses 18, and the pinned Prisma 6.19.3 schema/migrations do not require a different major version. Compose uses `postgres:18-alpine` and mounts `/var/lib/postgresql`, matching the image's versioned data directory. An existing PostgreSQL 16 data volume must never be opened with 18; a separately reviewed upgrade/restore is required if such a volume exists.

Bootstrap `ledger_runtime` and `ledger_readonly` with [backend/scripts/01-runtime-roles.sh](../backend/scripts/01-runtime-roles.sh), supplying passwords through the secret manager. On a fresh Compose database the PostgreSQL entrypoint runs it automatically. It creates restricted login roles and schema USAGE, without granting future table access. The existing `migrate` service runs Prisma migrations and then [runtime-grants.sql](../backend/scripts/runtime-grants.sql) through `apply-runtime-grants.cjs`. No second migration service or runtime startup migration exists. Use the same dedicated migration owner for migrations and grants: defaults are owner-specific. Compose bootstraps as `postgres`; its migration connection must use that owner. An external database may use a separately provisioned schema owner, with administrative bootstrap performed separately.

Runtime permissions are explicit: SELECT on ten application tables and only id/name/category on Vendor; INSERT on the nine writable tables (excluding Owner and Vendor); column-limited UPDATE on LineItem, Reminder, Notification, AssistantConversation and UsageBucket; DELETE only on QueryAudit, AssistantConversation, RevokedToken and UsageBucket. Approval history is append-only; ledger deletion is an UPDATE. The assistant connection has column-limited SELECT on LineItem and Vendor only. It cannot read Owner, audit/history, conversations, notifications, tokens, quotas or migration metadata. Owner lookup and vendor clarification use the runtime connection. Neither role has sequence grants, object ownership, role memberships, schema/database CREATE, TEMPORARY, TRUNCATE, REFERENCES or TRIGGER permissions. UUID/text keys need no sequences. PostgreSQL ACLs restrict objects/operations, while application authorization enforces owner row scope.

For an existing database, stop application traffic, rerun the role initializer with administrative credentials, then run the migration service as the existing schema owner. Initialization scripts do not rerun merely because a container restarts. The grant step removes legacy table, column and default grants before installing the allowlist. Review grants explicitly for every schema change; new tables do not automatically become accessible. Never run the development seed against production.

Copy `production.env.example` to `backend/.env.production`, replace placeholders through the host's secret manager, and restrict access to the resulting file. Set `PUBLIC_HOST` and `MIGRATION_DATABASE_URL` in the deployment environment. DNS must point at the host and ports 80/443 must be reachable for Caddy certificate issuance. The database must accept traffic only from authorized application/administrative networks. Apply an ingress IP request/connection limit; application quotas apply after authentication and do not replace edge abuse protection.

Production demo login is always disabled. A trusted identity system must issue HS256 tokens containing `kid`, `iss`, `aud`, unique UUID `jti`, `sub`, `role`, `iat`, `exp` and an existing Owner UUID in `ownerId` for every mutating identity, including administrators. Token lifetime is at most 15 minutes; this application has no refresh-token endpoint. Reauthentication belongs to the identity system. It must authorize role/owner claims rather than accept them from users. Integration with that system remains a release gate.

For rotation, deploy an overlapping `AUTH_JWT_KEYS` map to all instances, switch the issuer and active signing key, wait at least 15 minutes, then remove the old key everywhere. Emergency retirement removes the compromised key immediately. HTTP logout persists `jti` revocation; active sockets check revocation every 15 seconds and disconnect at token expiry. Operations endpoints require administrator authorization.

## PostgreSQL TLS certificates and connections

The intended architecture is the bundled PostgreSQL 18 Compose service. Caddy handles public HTTPS only; PostgreSQL terminates its own TLS. Production validation still requires `sslmode=require` on both application URLs. The committed `postgres/pg_hba.conf` rejects every non-TLS TCP connection and requires SCRAM passwords for TLS connections, including the migration owner. Local socket access for `postgres` is limited to the database container for initialization/administration; it is not a network plaintext exception. The database has no host-published port.

Obtain a server certificate from the operator's approved internal CA/PKI with `serverAuth` usage and a DNS SAN matching `db` (plus any approved alternate connection hostname). The issuer's private key stays with that PKI. Do not reuse Caddy's public HTTPS certificate or generate an ad-hoc production CA in the container. The disposable test certificate generator is for local/CI fixtures only.

Place the server leaf/intermediate chain as `server.crt` and its matching unencrypted private key as `server.key` in a restricted host directory **outside the repository**. Set its absolute path as `POSTGRES_TLS_DIR` in the deployment environment. Set `POSTGRES_CA_DIR` to a separate host directory containing **only** the public trust bundle `ca.crt`. Compose mounts both directories read-only: the server directory only into db at `/etc/postgresql/tls`, and the trust directory only into backend/migrate at `/etc/ledger/db-trust`. Missing directories fail instead of being created. Never place server/CA private keys in the trust directory or an image build context.

On the Linux host, make `server.key` owned by the PostgreSQL container UID with mode `0600`, or root-owned with the PostgreSQL container GID and mode `0640`. Resolve UID/GID from the approved image; ensure directory traversal is allowed only to the necessary administrator/PostgreSQL group. Certificate chain and public CA files may be `0644`; backend's non-root `node` user must be able to read the CA. Preserve these permissions on replacement. The Compose command sets `ssl=on`, explicit certificate/key paths, minimum TLS 1.2 and SCRAM password encryption. Missing, unreadable or mismatched server files prevent startup. These rules follow [PostgreSQL's TLS configuration](https://www.postgresql.org/docs/18/ssl-tcp.html) and [HBA policy](https://www.postgresql.org/docs/18/auth-pg-hba-conf.html).

Use these connection options (URL-encode passwords and any path characters when injecting values):

| Connection | Required options |
| --- | --- |
| `DATABASE_URL` / Prisma runtime | `sslmode=require&sslcert=/etc/ledger/db-trust/ca.crt&sslaccept=strict` |
| `MIGRATION_DATABASE_URL` / Prisma owner | Same options, with the dedicated migration-owner login |
| `READONLY_DATABASE_URL` / node-postgres | `sslmode=require&sslrootcert=/etc/ledger/db-trust/ca.crt` |

The backend examples include these options. Prisma calls the server CA `sslcert`; node-postgres calls it `sslrootcert`. The post-migration grant script translates the owner's CA parameter when opening its node-postgres connection; it does not change TLS mode or permissions. With the pinned pg 8.23.0 / pg-connection-string 2.14.0, `require` validates the CA/hostname; retain the TLS tests when upgrading that driver, whose warning announces different future mode semantics. Do not use `sslaccept=accept_invalid_certs`, `sslmode=no-verify`, `sslmode=disable` or `NODE_TLS_REJECT_UNAUTHORIZED=0`. No application validation exception is needed.

Monitor certificate expiry and renew before expiration. Install the new matching key/chain pair atomically in the mounted server directory, preserve permissions, then run `docker compose -f deploy/compose.yaml exec -u postgres db psql -X -d ledger -c 'SELECT pg_reload_conf();'`. Check database logs and establish **new** TLS connections; a failed reload can retain the old certificate, and existing sessions do not prove rotation. For CA rotation, first distribute an overlap bundle containing old/new public CAs, recreate backend so both pools load it, then replace/reload the server certificate. Verify runtime, assistant and migration TLS connections before removing the old CA and recreating backend again. Directory mounts allow replacement files to become visible; do not substitute bind mounts to individual certificate files. Use the existing migration command for owner verification, not another migration mechanism.

For existing PostgreSQL data volumes, confirm all login passwords use SCRAM (rotate via the secret manager if older verifiers exist), provision certificates and deploy the HBA/command configuration during the approved maintenance window. Do not weaken HBA to accommodate old clients. Staging certificates and their host placement remain operator inputs; the repository contains no real certificate or secret.

## Release sequence

1. Require green CI, dependency audits, a reviewed migration and an immutable recorded image digest. Build both images with `docker compose -f deploy/compose.yaml build`.
2. Take and verify a database backup. Run `docker compose -f deploy/compose.yaml run --rm migrate` with the dedicated migration owner connection. This applies migrations and the explicit role grants; either failure returns a nonzero exit code.
3. Run `docker compose -f deploy/compose.yaml up -d`. Compose waits for database health before starting `migrate`, and backend waits for both database health and `migrate` completion with exit code 0 (`service_completed_successfully`). Web waits for backend health. The same dependencies apply when starting `backend web`; do not use `--no-deps` to bypass them. Readiness and logs must still be checked. A manually completed one-off migration does not replace the dependency service; its repeated `migrate deploy` and grant application are idempotent. Keep the prior image digest available.
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
