# Pre-staging deployment contract decision — 2026-09-11

## PostgreSQL major version

Choose **18**, preserving the repository's CI and local verification target rather than treating the runbook alone as authority. `.github/workflows/ci.yml` already uses `postgres:18`; the available local server is 18.6. Prisma client and CLI are both pinned to 6.19.3. Inspection of all three migrations, the Prisma schema and raw SQL found ordinary PostgreSQL enums, UUID/text keys, numeric/date fields, indexes, foreign keys, `gen_random_uuid()`, conflict upserts and row locks; no extension or version-16-specific dependency. The pinned CLI/client must pass validation, migration deployment/status and PostgreSQL application tests on 18 before this decision is considered locally verified.

[Prisma's v6 database support reference](https://www.prisma.io/docs/orm/v6/reference/supported-databases) lists PostgreSQL 18. The [official PostgreSQL image documentation](https://hub.docker.com/_/postgres) specifies the 18+ volume mount at `/var/lib/postgresql` with versioned PGDATA. Compose now follows that layout. This is a fresh-deployment contract, not an in-place upgrade procedure for a PostgreSQL 16 volume. Image execution remains unverified; no Docker Desktop or staging actions are part of this cleanup.

## Migration and identity lifecycle

`docker compose -f deploy/compose.yaml run --rm migrate` is the explicit command. Normal `up -d` enforces `db healthy → migrate successful → backend healthy → web`. The migration command uses `&&` to apply the grant allowlist only after Prisma succeeds; a grant failure also prevents successful completion. The build target retains the pinned Prisma CLI; dependency pruning occurs in a separate runtime dependency stage so migrations cannot depend on an implicit `npx` download.

`backend/scripts/01-runtime-roles.sh` remains the role initializer. Password interpolation now happens in psql statements outside dollar-quoted blocks, using SQL literal quoting. It handles creation and reapplication, resets privileged attributes, removes memberships (NOINHERIT alone does not block SET ROLE), and revokes public CREATE/TEMPORARY. It does not grant access to future tables. The migration owner's `runtime-grants.sql` explicitly resets table/column/default ACLs and grants the following permissions. Bootstrap and grants are separate phases of the existing topology, because the entrypoint runs before Prisma creates tables.

## TLS architecture

Retain PostgreSQL on the Compose host; no managed-service migration is implied by this repository. Caddy terminates public HTTP/WebSocket/SSE TLS, not PostgreSQL traffic. The application production schema already demands `sslmode=require` for both database URLs; that policy remains unchanged. PostgreSQL now enables TLS with minimum version 1.2 and an explicit HBA file rejecting non-TLS TCP before accepting TLS/SCRAM. The Unix socket bootstrap exception is container-local and only allows the administrative postgres role. Port 5432 is no longer published to the host. TCP health checks avoid mistaking the entrypoint's socket-only temporary server for the final running database.

Production certificate source is the operator's approved internal PKI, with serverAuth and DNS SAN `db`. Host-supplied `POSTGRES_TLS_DIR` holds `server.crt` plus restricted `server.key`; the separate `POSTGRES_CA_DIR` contains only public `ca.crt`. Read-only directory mounts support atomic replacement and keep private keys out of backend/migrate. Missing sources fail closed. Keys must be PostgreSQL-owned `0600`, or root-owned/PostgreSQL-group-readable `0640`. They are never committed or baked into images; the disposable two-day CA generator is exclusively a test fixture. Full placement/rotation requirements are in the [runbook](RUNBOOK.md#postgresql-tls-certificates-and-connections).

Runtime and migration Prisma URLs use `sslmode=require&sslcert=/etc/ledger/db-trust/ca.crt&sslaccept=strict`; readonly node-postgres uses `sslmode=require&sslrootcert=/etc/ledger/db-trust/ca.crt`. The same migration connection is consumed by two drivers, so `pg-migration-url.cjs` maps Prisma's CA parameter for the grant phase and test harness only. It does not provide client identity/key material, disable verification or modify application behavior. The pinned node-postgres driver validates CA/hostname under `require`; its announced future mode changes require retesting on upgrades. [Prisma connection options](https://docs.prisma.io/docs/orm/v6/overview/databases/postgresql) and [node-postgres TLS options](https://node-postgres.com/features/ssl) document the different parameter conventions.

Renew server key/chain before expiration, atomically replace the mounted files and reload PostgreSQL; check logs and new TLS sessions. Trust-root rotations require an overlap bundle and backend recreation to reload both clients' trust before the server switches, followed by removal of old trust and another recreation. Existing sessions and a successful reload call alone do not prove certificate replacement. Production certificate issuance, installation and renewal ownership remain deployment inputs.

## Runtime privilege calculation

`ledger_runtime` SELECT covers ten named application tables and only Vendor.id/name/category. Prisma's unqualified `findUnique`, mutation RETURNING and nested reads return full model records; table SELECT preserves those actual queries without changing application logic. Vendor queries already select explicit columns. INSERT includes Prisma-generated UUIDs, defaults and RETURNING fields. UPDATE is restricted to columns written by the application:

| Tables | Writes | Source / reason |
| --- | --- | --- |
| Owner, Vendor | None | Catalog/reference validation; Prisma Owner reads return full records; assistant vendor resolution reads through runtime |
| LineItem | INSERT; UPDATE ownerId, name, category, description, billingPeriod, amount, startDate, endDate, renewalDate, status, version, deletedAt, updatedAt | `line-items.repository.ts`: creation, approval, edits, bulk operations, reassignment, soft deletion; reminder sweep also locks ledger rows |
| ApprovalEvent | INSERT | Same repository: append-only audit; catalog reads history |
| Reminder | INSERT; UPDATE ownerId, dismissedAt | `reminders.repository.ts`: sweep/upsert, reassignment, dismissal |
| Notification | INSERT; UPDATE ownerId, readAt | Sweep creates notifications; reassignment and dismissal update them |
| QueryAudit | INSERT, DELETE | `query-audit.repository.ts` and `operations.ts`: audit capture, admin read, retention |
| AssistantConversation | INSERT, DELETE; UPDATE updatedAt | `assistant.service.ts`: conversation creation, row locking, message append; retention deletion |
| AssistantMessage | INSERT | Nested message creation; retention uses database cascade from conversation, requiring no direct DELETE |
| RevokedToken | INSERT, DELETE | `auth.service.ts`: upsert with empty update branch; `operations.ts`: expiry cleanup |
| UsageBucket | INSERT, DELETE; UPDATE count | `operations.ts`: conflict increment, expiry cleanup |

No hard DELETE on ledger, history, reminders, notifications or messages; no history UPDATE; no catalog writes. No sequence permissions: all keys are UUID or text. No TRUNCATE, REFERENCES, TRIGGER, MAINTAIN, CREATE, temporary objects, ownership, membership or elevated role attributes. `_prisma_migrations` is accessible only to the migration owner. Future tables and sequences receive no application default grants. Migrations must review new runtime access explicitly.

## Assistant read-only privilege calculation

The canonical page/aggregate SQL in `line-items.repository.ts` and filters in `where-clause.builder.ts` need:

- LineItem: id, version, vendorId, ownerId, name, category, status, billingPeriod, amount, startDate, endDate, renewalDate, deletedAt and description (search predicate).
- Vendor: id and name (join, name search/sort, vendor aggregation).

`ledger_readonly` receives SELECT on those columns only. Owner is not joined by the query executor; owner scoping is a predicate on LineItem.ownerId. Owner resolution and vendor clarification already use the runtime connection. No SELECT on Owner/email, audit/history, conversations/messages, reminders/notifications, token revocations, quota state or migration metadata; no LineItem createdAt/updatedAt or unrelated Vendor columns. No writes or sequences. `default_transaction_read_only=on` is defense in depth; denial tests explicitly turn it off to prove ACL enforcement independently. These grants are not row-level security: authenticated owner restrictions remain the application's responsibility.

## Reproducible local role verification

From backend, run `npm run test:roles` with `ROLE_TEST_ADMIN_URL` pointing to `/postgres` on a **fresh disposable localhost PostgreSQL 18 cluster**, and optionally `PG_BIN`/`SH_BIN`. It refuses clusters containing the deployment roles, creates a uniquely named `_e2e` database, runs the actual shell initializer twice, deploys the three Prisma migrations, validates/status-checks, seeds only that isolated database as owner, and applies the real grants twice. Ten focused tests start Nest with the runtime login and use a separate owner connection only for fixture setup/assertions. They exercise HTTP ledger CRUD/export, approval history, reminders, reassignment, assistant persistence/queries, quotas, revocation and retention, then prove direct SQL denials, the complete effective ACL matrix, removal of legacy/future grants, and failure of the grant phase for an elevated existing login. The runner removes only its created database and roles; stop the disposable PostgreSQL process separately. CI now includes this suite, but no remote run is claimed.

The ordinary E2E harness uses an owner connection for fixture cleanup and is regression evidence, not least-privilege proof. The dedicated role suite provides the latter without granting production runtime permission to perform test-only hard deletes. No application business logic was changed.

## Verified evidence and remaining staging gates

Final local results on 2026-09-11:

| Check | Result |
| --- | --- |
| Backend unit tests | 62 passed, 14 suites |
| Backend PostgreSQL E2E | 68 passed, 9 suites, isolated regression_e2e database |
| Deployment-role PostgreSQL tests | 10 passed on fresh local PostgreSQL 18.6; actual shell initializer and grant script; application logins authenticated using SCRAM, including passwords containing quoting characters |
| Backend lint/build; frontend build | Passed |
| Prisma validation, migration deployment/status | Passed with pinned 6.19.3; all three migrations applied; schema up to date |
| Compose topology / CI YAML | Parsed and dependency conditions checked without Docker |
| Playwright | Not rerun: no frontend deployment configuration changed; six tests remain prior local evidence |

Initial test iterations exposed test-only DTO/connection/SQL-overload mistakes; these were corrected before the final passing results. No privilege denial was solved by restoring blanket grants. The 10 additional role tests are separate from the existing 68 E2E baseline. The fresh cluster was created under ignored `backend/test-results`, bound to loopback, and stopped after verification; the role runner removed its database and logins. Test output and database artifacts are excluded from the Docker build context, and shell scripts use LF on checkout.

Historical status at the end of the earlier role-cleanup pass: PostgreSQL TLS configuration was missing and staging remained blocked. The following TLS gate supersedes that specific finding; it does not represent staging execution or close the other release gates.

## TLS gate evidence — 2026-09-11

The missing PostgreSQL TLS configuration is resolved and verified locally on a separate disposable PostgreSQL 18.6 cluster. It used the committed HBA policy, TLS 1.2 minimum, a generated two-day test CA/server certificate and SCRAM authentication. Test certificates/credentials were isolated under ignored `backend/test-results`, not deployment inputs. The disposable server was stopped and its saved connection credentials/private-key files removed after verification. No Docker Desktop or real staging host was used.

| Verification | Final result |
| --- | --- |
| Plaintext owner, ledger_runtime and ledger_readonly connections | All rejected by PostgreSQL HBA, SQLSTATE 28000 |
| Trusted TLS owner/runtime/readonly | Successful; pg_stat_ssl confirmed SSL on each driver/role connection; node-postgres negotiated TLS 1.3 |
| Untrusted CA | Rejected by both Prisma and node-postgres |
| Prisma 6.19.3 validation, migrations, status | Passed over strict TLS; all three migrations applied to a fresh role-test database; status up to date |
| Production startup | Compiled dist/src/main.js started with NODE_ENV=production and unchanged validation, readiness passed, authenticated assistant answered through readonly TLS, demo route returned 404 |
| TLS plus deployment-role suite | **13 passed, none skipped**: three TLS/startup checks plus all ten unchanged least-privilege scenarios; complete effective ACL matrix matched |
| Backend PostgreSQL E2E | **68 passed / 9 suites** over TLS after isolating developer .env |
| Backend unit | **62 passed / 14 suites** |
| Backend lint/build; frontend build | Passed |
| Dependency audits | Backend **0 vulnerabilities**; frontend **0 vulnerabilities**, npm audit --audit-level=high succeeded |
| Relevant CI validation | YAML parsed; TLS flags, CA/private-key mount separation, missing-source behavior, migration completion dependency, mandatory role/TLS steps and CI ordering checked; new scripts passed syntax checks |

Prisma's Windows Schannel initially failed under the restricted sandbox token; the identical URL and CA succeeded outside that sandbox. The TLS and E2E checks therefore ran in the normal Windows security context against only the disposable loopback database. Certificate verification was not disabled. A compiled-assistant timeout also exposed that Nest could reload provider settings from the developer .env; the test launchers now use empty temporary working directories with explicit TypeScript configuration. This changed only test isolation, not production validation or behavior. Final runs do not load developer provider credentials.

## Broader deployment diff review

- `backend/Dockerfile`: retains the pinned migration CLI in the build target and prunes only the runtime dependency stage. Runtime remains non-root; the base Node/OpenSSL settings are unchanged from main. This earlier deployment fix is legitimate; image execution still needs remote evidence.
- `backend/package.json`: adds only role/TLS verification commands. No dependency version or backend/frontend lockfile changes.
- `backend/jest.config.js`: separates database-role integration tests from the unit runner. All 62 unit tests still run; CI has mandatory dedicated role and TLS runs. No test assertion was removed, no continue-on-error or CI bypass was introduced. TLS-only checks run in the TLS entry point, where all 13 tests passed.
- `.github/workflows/ci.yml`: adds role verification and a final disposable-service TLS phase after browser tests. The latter generates fixture certificates, installs the committed HBA policy into the CI service and runs production startup/role tests. It must remain after browser tests so their existing development URLs are not broken. This CI Docker fixture was reviewed and syntax-checked, not executed locally or remotely in this task.
- `.gitattributes`: forces LF for shell scripts, preserving Linux entrypoint execution.
- `deploy/compose.yaml`: PostgreSQL 18/data layout and migration ordering remain intact. Changes are confined to database TLS, separate read-only certificate mounts, TCP readiness and removal of public database-port publishing. Caddy/web configuration is unchanged.
- Found and fixed: Prisma/node-postgres interpret `sslcert` differently; the grant/E2E adapters now map the server CA correctly. Developer .env contamination of integration tests was also fixed without a production exception. Certificate/private-key files are excluded from Git and both image contexts.
- No unrelated dependency changes, committed private keys, real passwords, application-source changes or weakened production validation were found. Deployment paths are environment-supplied; fixed certificate paths are the documented container interface, and loopback addresses/generated credentials appear only in disposable fixtures.

Remaining release gates: the operator must issue/install staging certificates and assign renewal ownership; supply reviewed identity/secrets/DNS/host settings; observe remote CI and image build/scan results for this diff; then, only with staging authorization, verify live HTTPS/proxy/SSE/WebSocket behavior, Linux certificate permissions, container migration/grant failure gating, persistence, backups/restore and rollback. Local native-PostgreSQL proof is not container or public-host deployment evidence. REMAINING_WORK.md remains authoritative.
