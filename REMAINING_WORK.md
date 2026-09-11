    # Remaining Production Work

    Reviewed: 2026-09-10

This is the release control document for the current repository state. It governs release progression, approval gates, and the evidence required before sign-off. It distinguishes what is implemented and locally verified from what has only been demonstrated in a live deployment environment.

This document is the source of truth for release decisions. [PRODUCTION_READINESS.md](PRODUCTION_READINESS.md) remains the assessment and evidence report, not the release gate.

## Current gate status

- **D1: CLOSED.** Local dependency, build and image-scan evidence is recorded separately.
- **D2: OPEN / ENVIRONMENT-BLOCKED.** Repository deployment defects were fixed, but Docker Desktop/containerd failed with `read-only file system` during image/build metadata operations. Migration, runtime API, frontend container, recovery and persistence proof were not claimed. Public or cloud deployment was not available.
- **D3: EVALUATED.** The repository has a strong local code/test baseline, but the remaining Phase A release gates below are not all closed. Remote CI, staging deployment, production operations, capacity and release decisions remain outside the local evidence.

- 62 backend unit tests passing.
- 68 PostgreSQL E2E tests passing.
- 6 frontend Playwright tests passing.
- Backend lint and build passing.
- Frontend build passing.
- Prisma validation, generation, migration deployment and migration status passing locally.
- Fresh dependency audit results showing zero high-severity vulnerabilities in backend and frontend. The earlier 12-path finding is historical and no longer active evidence.
- PostgreSQL restore drill passing for all 12 public tables with matching row counts and content digests.
- Production environment validation for TLS database URLs, read-only database separation, explicit identity settings, CORS, demo-login disablement and paired Gemini settings.
- Authenticated actor attribution, JWT issuer/audience validation, key-ring rotation support and revocation tests.
- PostgreSQL-backed request quotas with `429` and `Retry-After` behavior.
- Architecture, security, deployment and disaster-recovery documentation.
- Authorization matrix and focused HTTP boundary tests for owner/admin/anonymous, IDOR, export, reminders, expired and revoked credentials.
- Direct live Gemini adapter smoke tests with `gemini-3.6-flash` returning structured intents for spend, vendor, renewal and mutation-shaped questions.
- Gemini structured-output compatibility fix for the current API (`responseMimeType` and `responseSchema`).
- Compiled NestJS dependency-injection fixes for configuration and reminder startup paths.

These results do not prove production readiness. They prove the current codebase has a tested local baseline and is substantially matured beyond an early prototype.

## Explicitly excluded for now

The following activities require a real deployment environment and are intentionally not part of the current implementation phase:

- Pushing or observing remote GitHub Actions runs.
- GitHub branch protection configuration.
- Docker image build and runtime verification in a remote environment.
- Staging or production deployment.
- DNS, HTTPS certificate issuance and public proxy verification.
- Production PostgreSQL backup scheduling and restore rehearsal.
- External error tracking, metrics collection and alerting.
- Load testing against production-sized infrastructure.
- Live Gemini provider evaluation and representative evaluation set under real provider conditions; compiled deterministic `/assistant/ask` HTTP coverage is now locally verified.

## Release priorities

### Phase A — Close remaining code/security uncertainty

Do these before deployment:

1. Complete authorization matrix.
2. Finish actor/audit semantics.
3. Complete malicious-input matrix.
4. Complete assistant adversarial tests.
5. Finish API response contracts.
6. Verify concurrent ledger/reminder behavior.
7. Run `EXPLAIN ANALYZE`.
8. Run the compiled `/assistant/ask` live evaluation.
9. Finalize authentication strategy.
10. Finalize retention/privacy decisions.

Important principle: do not deploy something whose security semantics are still undecided.

### Phase B — Prove the repository works outside your machine

Then:

1. Push branch.
2. Run GitHub Actions.
3. Fix anything Ubuntu or CI-specific.
4. Enable branch protection.
5. Build Docker image remotely.
6. Scan image.
7. Deploy staging.
8. Run migrations.
9. Run fresh-environment smoke tests.

This is where the remaining “works locally” problems are likely to surface.

### Phase C — Prove operations

Then:

1. HTTPS/proxy.
2. WebSocket.
3. SSE.
4. CORS/preflight.
5. CSP/HSTS.
6. Monitoring.
7. Centralized logs.
8. Alerts.
9. Backup scheduling.
10. Restore rehearsal.
11. Migration failure rehearsal.
12. Rollback rehearsal.

At that point the system is much closer to a genuine production candidate.

### Phase D — Establish capacity

Finally:

1. 10 → 100 → 1k → 10k → 100k rows.
2. `EXPLAIN ANALYZE`.
3. Cursor pagination stress.
4. Aggregate performance.
5. CSV export performance.
6. Assistant workload.
7. k6 load test.
8. Connection pool behavior.
9. Determine actual capacity.

This should come after the system is deployed in production-like infrastructure; otherwise you are largely measuring a development environment.

## P0 — release blockers and decisions

### 1. Dependency audit

Previous audit identified 12 high-severity dependency paths. A fresh `npm audit --audit-level=high` now reports zero high-severity vulnerabilities in backend and frontend. No current dependency blocker is evidenced. Remote CI must reproduce this result and future lockfile changes must be reviewed.

### 2. Authentication strategy

The current authentication implementation is materially stronger than the earlier review, but the remaining question is operational rather than architectural:

- Secret is stored outside Git.
- Rotation is documented.
- Old keys can be retired.
- Tokens expire quickly.
- Revocation works.
- Issuer/audience are validated.
- Provisioning and deprovisioning are defined.
- Audit identity is unambiguous.

This is reasonable for a take-home or demo project. Do not add an external IdP automatically unless a real deployment mandate requires it.

### 3. Assistant provider data policy

Because the assistant may send potentially sensitive business or financial information to Gemini, this is a release blocker if Gemini is enabled.

The required decision record is:

- What data can be sent to Gemini?
- Are line-item amounts sent?
- Are vendor names sent?
- Are owner names or IDs sent?
- Are conversation histories sent?
- How long does the provider retain requests?
- Is provider training enabled or disabled under the applicable service configuration?
- What happens if Gemini is unavailable?
- What is the maximum context sent?
- Who is allowed to invoke the assistant?

The simplest policy is: if `GEMINI_API_KEY` is absent, the assistant provider feature is disabled and the runtime behavior is documented.

### 4. Concurrency and snapshot consistency

The implementation executes ledger page and aggregate queries inside one `REPEATABLE READ` transaction. CSV pagination also traverses its pages inside one `REPEATABLE READ` transaction, so concurrent committed writes are not mixed into one response or export. This provides snapshot consistency, not serializable conflict detection.

Three valid choices exist:

- A. Same transaction/snapshot: best if the response is meant to represent one coherent ledger state.
- B. Explicit eventual semantics: document that pagination and aggregates are independently evaluated and may reflect different committed states under concurrent mutation.
- C. Return a consistency/version marker: more sophisticated and probably unnecessary for this project.

The verified contract is A: a response or export represents the database snapshot captured when its read transaction begins. Concurrent writes committed afterward are visible to later requests, not to the in-flight response or export.

### 5. Remote CI and branch protection

- `.github/workflows/ci.yml` exists and is intended to validate Prisma, migrations, unit tests, PostgreSQL E2E tests, lint, builds and browser tests.
- The workflow has not yet been observed in GitHub Actions.
- The branch protection and CI gate remain unproven outside the local environment.

### 6. Production configuration and secret handling

- Startup validation exists.
- Production rejects unsafe defaults and local-only values.
- Example production configuration exists.
- Real secret storage, production values and deployment verification remain open work.

### 7. Backup, restore and disaster recovery

- Local restore drill covers all public tables with matching row counts/content digests when `TEST_DATABASE_ADMIN_URL` is configured; it was not executable in this environment because that admin URL is unset.
- Production backup schedule, encrypted off-site storage, retention and agreed RPO/RTO remain operational decisions.

## Provider data and retention policy

The deterministic assistant path keeps questions and results inside the application. When Gemini is enabled, the provider request contains the user's question plus bounded intent hints only: vendor text, category, annualization flag, supported period and year. It does not send owner IDs, line-item IDs, database rows, generated SQL, credentials or conversation history. Gemini returns a validated intent; it never supplies executable SQL or final financial figures.

Application retention is controlled by `RETENTION_ENABLED` and `RETENTION_DAYS`. When enabled, scheduled cleanup removes old assistant conversations/messages and query-audit records; it does not remove ledger records, approvals, reminders or notifications. Request logs intentionally exclude assistant question bodies and authorization headers. External provider retention, training use and regional processing are **UNVERIFIED** in this repository and must be confirmed from authoritative provider policy/configuration before enabling Gemini for real customer data.

## P1 — product/API completion and release coverage

- Explicit response DTOs and detailed Swagger schemas for all routes.
- Finish amount upper-bound validation, consistent conflict semantics and complete audit coverage of individual mutations.
- Verify the complete Gemini-backed `/assistant/ask` path with configured credentials/model; direct adapter smoke tests pass, while compiled HTTP verification and the full representative evaluation set remain open.
- Replace string-based follow-up concatenation with structured bounded conversation state.
- Broaden browser tests to admin bulk operations, edit conflicts, candidate selection, live reminder arrival/dismissal, expired sessions, accessibility and supported browsers.
- Review data retention, conversation/audit access and provider-data handling.
- Verify a genuinely fresh checkout against an empty database and document complete deployment and reviewer setup.

## P2 — testing, performance and operations

- Load testing: no production-shaped workload or measured breaking point is yet recorded.
- Query and pagination performance: representative seeded-scale `EXPLAIN ANALYZE` plans now exist; production-scale review and cursor stress evidence remain open.
- Frontend production audit: build and smoke coverage good locally, but production edge states and accessibility remain open.
- Observability: request logging and health checks exist, but centralized metrics, logs and alerts are not yet deployed and verified.
- Container and deployment verification: Docker, HTTPS, proxy behavior, database roles, migrations and rollback rehearsal are not yet proven in a real environment.

## Current assessment

| Area | Current state |
| --- | --- |
| Core backend architecture | Strong |
| Financial correctness | Strong |
| Database design | Strong |
| Authorization | Strong; final coverage remains |
| Authentication | Strong; operational decision remains |
| Assistant architecture | Strong |
| AI provider integration | Good; evaluation remains |
| Testing | Very good locally |
| Dependency security | Clean in current audit |
| Docker | Defined, unverified |
| CI | Defined, unverified |
| Observability | Partial |
| Disaster recovery | Locally demonstrated; production rehearsal missing |
| Performance | Not yet demonstrated |
| Production deployment | Not demonstrated |

This is a substantially tested production candidate whose remaining risks are primarily deployment, operational verification, performance characterization and a small number of security and consistency decisions. It is not yet production-ready, but it is no longer reasonably described as a simple demo.

## Highest-value next milestone

The highest-value next milestone is:

finish the P0 code-level gates → push → green remote CI → staging deployment → attack/failure tests → backup/restore → load test → release review.

That sequence preserves the correct priority order: prove the security and consistency of the code first, then prove the repository works outside your machine, then prove the operating environment, and only then quantify capacity.

## Historical note

The earlier review record included a stale dependency finding that was superseded by a fresh audit. The newer evidence is authoritative for the current state: no current high-severity dependency blocker is evidenced, but future lockfile changes must be reviewed and remote CI must reproduce the same result.
