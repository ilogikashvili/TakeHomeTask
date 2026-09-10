# Remaining Production Work

Reviewed: 2026-09-10

This document describes the work remaining after the local implementation and verification completed in this repository. Deployment execution is intentionally excluded for now.

## Current verified baseline

The repository currently has local evidence for:

- 61 backend unit tests passing.
- 54 PostgreSQL E2E tests passing.
- 4 frontend Playwright tests passing.
- Backend lint and build passing.
- Frontend build passing.
- Prisma validation, generation, migration deployment and migration status passing locally.
- Backend and frontend high-severity npm audits reporting zero vulnerabilities.
- PostgreSQL restore drill passing for 12 public tables with matching row counts and content digests.
- Production environment validation for TLS database URLs, read-only database separation, explicit identity settings, CORS, demo-login disablement and paired Gemini settings.
- Authenticated actor attribution, JWT issuer/audience validation, key-ring rotation support and revocation tests.
- PostgreSQL-backed request quotas with `429` and `Retry-After` behavior.
- Architecture, security, deployment and disaster-recovery documentation.
- Authorization matrix and focused HTTP boundary tests for owner/admin/anonymous, IDOR, export, reminders, expired and revoked credentials.

These results do not prove production readiness. They prove the current codebase has a tested local baseline.

## Explicitly excluded for now

The following activities require a real deployment environment and are intentionally not part of the current implementation phase:

- Pushing or observing remote GitHub Actions runs.
- GitHub branch protection configuration.
- Docker image build and runtime verification.
- Staging or production deployment.
- DNS, HTTPS certificate issuance and public proxy verification.
- Production PostgreSQL backup scheduling and restore rehearsal.
- External error tracking, metrics collection and alerting.
- Load testing against production-sized infrastructure.
- Live Gemini provider verification.

## Priority 0: Release blockers

### 1. Remote CI and branch protection

Current state:

- `.github/workflows/ci.yml` exists.
- The workflow validates Prisma, deploys/checks migrations, runs unit tests, runs isolated PostgreSQL E2E tests, runs lint/build, builds the frontend and runs browser tests.
- The workflow has not been observed in GitHub Actions.

Remaining work:

1. Push the current branch to the GitHub repository.
2. Confirm the workflow starts on a pull request.
3. Confirm the PostgreSQL service starts and migrations apply.
4. Confirm all backend and frontend jobs pass on Ubuntu.
5. Configure `main` branch protection.
6. Require the CI check before merging.
7. Require pull requests and review approval according to team policy.

Acceptance evidence:

- A green GitHub Actions run linked to a commit.
- Branch protection requiring that check.

Needed from the owner:

- GitHub repository administrator access or a person who can configure branch protection.

### 2. Production configuration and secrets

Current state:

- Startup validation exists.
- Production rejects unsafe defaults and local CORS/database settings.
- Example production configuration exists.

Remaining work:

1. Decide where secrets are stored.
2. Create real production values outside Git.
3. Confirm the production frontend origin.
4. Confirm database connection pool and timeout limits.
5. Confirm request and assistant quotas.
6. Confirm retention policy.
7. Verify startup fails with each required value missing.
8. Verify startup succeeds with approved values.

Acceptance evidence:

- A reviewed variable inventory.
- A secret-manager or host configuration record.
- Startup logs showing successful validation without printing secrets.

Never provide secrets in chat or commit them to the repository.

### 3. Authentication strategy

Current state:

- The application validates HS256 tokens, issuer, audience, expiry, issued-at, JTI, role and owner mapping.
- Access tokens are limited to 15 minutes.
- Logout stores token JTIs in the database.
- Key overlap and retired-key rejection are tested.
- Development demo login is disabled outside development.

Remaining decision:

Choose one strategy:

#### Strategy A: Keep application-issued HS256 for this project

Define and approve:

- Secret storage location.
- Key rotation interval.
- Emergency compromised-key procedure.
- Key overlap period.
- Token revocation retention.
- Reauthentication behavior after expiry.
- Administrator-to-audit-actor mapping.
- User provisioning and deprovisioning.

#### Strategy B: Integrate an identity provider

Define:

- Provider name.
- Issuer URL.
- Audience/client ID.
- Signing algorithm, preferably RS256 or ES256.
- JWKS key-discovery URL.
- User ID claim.
- Role claim.
- Owner ID claim or application-user mapping.
- Account disablement behavior.
- Provider logout/revocation behavior.

Acceptance evidence:

- Authentication decision recorded in `SECURITY.md`.
- Tests for invalid issuer, audience, signature, expiry, role and owner mapping.
- Documented rotation and incident procedure.

### 4. Authorization and IDOR audit

Current state:

- Owner line-item scope is enforced.
- Conversation ownership is enforced.
- Approval history is scoped.
- Reminder scope is enforced.
- Forged actor IDs are rejected.
- Admin mutations use the authenticated mapped actor.
- `docs/AUTHORIZATION-MATRIX.md` defines endpoint policy and expected status codes.
- `authorization-matrix.e2e-spec.ts` covers anonymous access, owner scope anti-widening, foreign objects, admin access, exports, reminders, expiry, revocation and forged actors.
- The same suite covers malformed UUID/decimal/unknown-field input and mutation-shaped assistant/SSE requests.

Remaining work:

1. Expand the dedicated suite to every route and credential combination, including conversations, bulk, owners and provider-shaped requests.
2. Test invalid issuer/audience and all malformed token forms at the HTTP boundary.
3. Review administrator access and audit attribution with the data owner.

Acceptance evidence:

- Matrix checked into the repository.
- Dedicated tests pass for every protected endpoint.
- No foreign-owner read, write, export or assistant disclosure succeeds.

### 5. Database hardening

Current state:

- Separate read-only database execution exists.
- Read-only SQL enforcement is tested.
- Production database URLs require TLS.
- A least-privilege role script exists.

Remaining work:

1. Create separate migration, runtime and assistant roles in staging.
2. Remove superuser and schema-creation privileges from runtime roles.
3. Verify the read-only role cannot INSERT, UPDATE, DELETE, CREATE, ALTER or DROP.
4. Configure pool size, connection timeout, statement timeout and idle timeout.
5. Test behavior when the database is unavailable or connections are exhausted.
6. Review indexes and grants after every migration.

Acceptance evidence:

- Staging SQL privilege test output.
- Connection-pool settings and capacity calculation.
- Reviewed grants for each role.

### 6. Backup and recovery

Current state:

- Local restore drill passes for 12 public tables.
- Restore procedure is documented.

Remaining work:

1. Choose a scheduled encrypted backup/PITR provider.
2. Define retention duration.
3. Store backups off-server with restricted access.
4. Approve RPO and RTO.
5. Monitor backup age and failure.
6. Restore a production-like backup into an isolated database.
7. Measure restore time and data loss point.

Acceptance evidence:

- Successful restore report.
- Approved RPO/RTO.
- Backup monitoring and ownership record.

### 7. Migration discipline

Current state:

- Prisma migrations are committed.
- Deployment uses `prisma migrate deploy`.
- CI checks migration status.
- E2E uses a separate database.

Remaining work:

1. Review each migration before release.
2. Test migrations on a production-sized copy.
3. Define backward-compatible expand/migrate/contract changes.
4. Define forward repair versus restore for rollback.
5. Rehearse migration failure handling.

Acceptance evidence:

- Migration review record.
- Successful production-like migration run.
- Tested rollback or forward-repair decision.

## Priority 1: Security and operations

### 8. Rate limits and abuse controls

Implemented:

- PostgreSQL-backed shared quota buckets.
- General and assistant-specific limits.
- `429` responses with `Retry-After`.

Remaining:

- Configure edge/IP protection.
- Select production quota values.
- Test multiple application instances.
- Run abuse and legitimate-traffic tests.
- Add provider cost monitoring if Gemini is enabled.

### 9. CORS and security headers

Implemented:

- Explicit configurable CORS origins.
- Helmet enabled.

Remaining:

- Verify production preflight and rejected origins.
- Verify HSTS, CSP, frame protection, referrer policy and content-type headers through the real proxy.
- Confirm Swagger and frontend behavior under the selected CSP.

### 10. Input, SQL and CSV security

Implemented:

- DTO validation and unknown-property rejection.
- Prisma parameterized queries.
- Read-only SQL boundary.
- CSV quoting and formula-prefix neutralization.

Remaining:

- Run the complete malicious-input matrix against HTTP endpoints.
- Test long strings, arrays, objects, invalid dates, UUIDs, decimals, NaN, Infinity and Unicode.
- Test CSV newlines, tabs, quotes, formulas, encoding and safe filenames.
- Inventory every raw SQL call.

### 11. Assistant security and reliability

Implemented:

- Mutation-shaped request rejection.
- Authorized conversation context.
- Strict Zod intent validation.
- Candidate vendor confirmation.
- Read-only canonical query execution.
- Provider timeout, retry and failure handling.
- Versioned `intent-schema-v1` contract.

Remaining:

- Test prompt-injection attempts and cross-owner requests.
- Test malformed, empty, truncated and unexpected provider responses.
- Run a representative financial-question evaluation set.
- Verify live Gemini behavior if the feature is enabled.
- Define provider data-retention and cost policy.

### 12. Observability

Implemented:

- Request ID propagation.
- Structured method, route, status and duration logging.
- Configurable log level.
- Basic in-process metrics.
- Liveness and database readiness endpoints.

Remaining:

- Choose an error-monitoring provider.
- Export metrics to a durable monitoring system.
- Centralize logs with retention and access controls.
- Add alerts for 5xx rate, latency, readiness, database capacity, quota spikes, backup failures and restarts.
- Assign alert owners and rehearse the runbooks.

Needed from the owner:

- Monitoring provider choice.
- On-call owner.
- Log and metric retention requirements.
- Alert thresholds.

### 13. Runtime and delivery behavior

Implemented locally:

- Multi-stage non-root Docker image definition.
- Compose backend, web and migration services.
- Graceful application shutdown hooks.
- SSE and socket reconnect/recovery behavior.

Remaining:

- Build and scan Docker images.
- Test SIGTERM with active requests, SSE and sockets.
- Test proxy buffering and idle timeouts.
- Test public HTTPS and SPA deep links.
- Test multiple instances if scaling is required.

## Priority 2: Testing and performance

### 14. Load testing

Needed:

- Expected concurrent users.
- Expected row counts.
- Request mix.
- Assistant volume.
- Export sizes.
- Latency targets.

Work:

- Add a k6 or equivalent workload.
- Measure p50, p95, p99 and error rate.
- Measure PostgreSQL connections, CPU, memory and query latency.
- Record the breaking point and capacity recommendation.

### 15. Query and pagination performance

Work:

- Run `EXPLAIN ANALYZE` for ledger filters, sorting, aggregates, assistant queries and exports.
- Test 10, 100, 1,000, 10,000 and 100,000-plus rows.
- Verify cursor stability, duplicates, missing rows and aggregate correctness.
- Compare actual query plans against existing indexes.

Acceptance evidence:

- Query-plan report.
- Pagination stress report.
- Index changes justified by measured plans.

### 16. Frontend release coverage

Existing coverage:

- Owner login.
- Ledger filtering and CRUD.
- Admin bulk/conflict flow.
- Assistant clarification/link flow.
- Logout and expired session behavior.
- Reminders access.
- Mobile rendering.

Remaining:

- Accessibility and keyboard navigation.
- Loading, empty and network failure states.
- 401, 403, 429 and provider failure UI.
- Live reminder delivery and dismissal.
- Browser support matrix.
- Admin authorization and destructive-action confirmation.

### 17. Operational safety and privacy

Remaining:

- Define audit-log immutability and access.
- Define retention for conversations, query audits, notifications and logs.
- Approve provider data handling.
- Document data deletion and export procedures.
- Review stored fields for minimization.
- Define who may access operational audit records.

## Final release gate

A release can be considered production-ready only after all of the following are evidenced:

- Green remote CI run.
- Branch protection enabled.
- Approved authentication strategy.
- Authorization matrix and IDOR suite passing.
- Database roles and TLS verified.
- Backup restore completed against approved RPO/RTO.
- Migration and rollback procedure rehearsed.
- Error tracking, metrics and alerting active.
- Docker/staging deployment verified.
- HTTPS and proxy behavior verified.
- Load and query performance reports reviewed.
- Frontend release suite and accessibility review complete.
- Security, deployment and disaster-recovery documents approved.
- Fresh-environment smoke test passed.

Until those conditions are met, describe the repository as a tested production candidate, not a production system.
