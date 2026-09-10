# Implementation checklist

Updated 2026-09-10 after authorization testing, live Gemini adapter verification and compiled-bootstrap checks.

Current assessment: a working full-stack demonstration with substantive correctness coverage. It is **not production-ready**. See [PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md) for release gates and the evidence needed to close them.

## Implemented and locally verified

- [x] PostgreSQL migrations, constraints and deterministic development seed.
- [x] Canonical ledger filters, all six sort fields in both directions, stable decimal cursors and optimistic-lock versions.
- [x] Page-independent totals, vendor/category breakdowns and PostgreSQL annualization.
- [x] HTTP lifecycle, owner restrictions, approval events, optimistic conflicts and soft deletion.
- [x] Atomic bulk status changes, reassignment and deletion with limits and audit events.
- [x] Atomic transfer of existing reminders/notifications on single and bulk owner reassignment.
- [x] Reminder/notification persistence with uniqueness, rollback and retry tests.
- [x] Calendar-date and decimal-precision validation; explicit nullable renewal clearing; invalid optional null rejection.
- [x] Sanitized errors with validation details and missing-reference handling.
- [x] Owner/vendor lookup endpoints, authorized approval history and authenticated identity endpoint.
- [x] Assistant validated intent, conservative vendor clarification, candidate selection and UTC renewal windows.
- [x] Assistant canonical queries on a read-only transaction, database calculations and matching ledger links.
- [x] Owner-scoped persisted conversations and basic period follow-ups.
- [x] Optional Gemini adapter with structured output, Zod validation, timeout/retry and mocked contract/failure tests.
- [x] Live Gemini adapter smoke test with `gemini-3.6-flash`: valid spend, vendor, renewal and mutation-shaped intents observed; credentials are local-only and must never be committed.
- [x] Updated Gemini request contract to `responseMimeType`/`responseSchema` and removed unsupported `additionalProperties`.
- [x] Fixed compiled NestJS configuration and reminder dependency injection wiring discovered during live bootstrap verification.
- [x] Authenticated SSE progress/result responses and authorized CSV export.
- [x] Structured request logging and JWT header/expiry checks.
- [x] Development-only, explicit opt-in demo login with 15-minute tokens.
- [x] React frontend: ledger filters, all sorts, pagination, aggregates, CSV, create/edit/delete and bulk action controls.
- [x] Frontend assistant: chat, streamed answers, candidate buttons and ledger links.
- [x] Frontend reminders: unread list, dismiss control, socket reconnect recovery and polling fallback.
- [x] Browser smoke test for owner login, filtering, fixture creation/deletion, assistant links, reminders page and mobile rendering.
- [x] Isolated *_e2e database migration/seed/test runner; remove fixed 2,500-row response assertions.
- [x] CI workflow written for backend validation/tests/build and frontend build/browser tests. Remote CI has not run.
- [x] Docker entrypoint corrected to actual build output, non-root runtime selected and secrets excluded from build context. Docker execution has not been verified.

Local verification: **61 unit tests, 54 PostgreSQL E2E tests, 4 browser tests**, Prisma validation/generation, migration deployment/status, backend/frontend builds, backend lint and high-severity dependency audits pass. Live Gemini adapter smoke tests pass; full compiled `/assistant/ask` verification is still being rerun after bootstrap wiring fixes.

## P0 — Required before serving real customer data

- [ ] Production identity: issuer/provider or managed signing-key rotation; issuer/audience validation; session refresh/revocation policy.
- [ ] Revalidate/expire active WebSocket sessions and derive audit actors from authenticated identity, including admins.
- [ ] Triage and remediate dependency findings. Current npm runtime audit reports 12 high-severity dependency paths; document reachability and any accepted exceptions.
- [ ] Configure HTTPS, production frontend proxy/origins, secret storage and separate least-privilege database roles.
- [ ] Add abuse controls: request/provider rate limits, cost quotas and bounded expensive queries/exports/conversation context.
- [ ] Guarantee consistent row/aggregate snapshots within a response and CSV snapshot behavior under concurrent writes.
- [ ] Test scanner-versus-reassignment/delete races and define notification handover/read-state semantics.
- [ ] Implement readiness checks, metrics, alerts, persistent log handling and operational runbooks.
- [ ] Configure backups and demonstrate restoration against agreed recovery time/data-loss targets.
- [ ] Prove staging/container deployment, migrations, rollback and restart/reconnect behavior.
- [ ] Run the CI workflow remotely and add security/dependency checks and production acceptance tests.

## P1 — Product/API completion and release coverage

- [ ] Explicit response DTOs and detailed Swagger schemas for all routes.
- [ ] Finish amount upper-bound validation, consistent conflict semantics and complete audit coverage of individual mutations.
- [ ] Verify the complete Gemini-backed `/assistant/ask` path with configured credentials/model; direct adapter smoke tests pass, while compiled HTTP verification and the full representative evaluation set remain open.
- [ ] Replace string-based follow-up concatenation with structured bounded conversation state.
- [ ] Broaden browser tests to admin bulk operations, edit conflicts, candidate selection, live reminder arrival/dismissal, expired sessions, accessibility and supported browsers.
- [ ] Review data retention, conversation/audit access and provider-data handling.
- [ ] Verify a genuinely fresh checkout against an empty database; document complete deployment and reviewer setup.

## Conditional or optional improvements

- [ ] Complete LangGraph orchestration and retire unused scaffold files if required by the assignment or chosen implementation.
- [ ] Add model-generated explanations only if they improve the product without changing database-calculated facts.
- [ ] Add owner-aware caching with reliable invalidation only after measurements justify it.
- [ ] Add a durable notification outbox/retry worker if guaranteed push delivery is required. Persisted unread recovery already exists.
- [ ] Add more advanced infrastructure only against explicit capacity/availability needs.

The lack of a cache or LangGraph does not by itself make an application unfit for production. Unverified authentication, recovery, data isolation and deployment do.

External configuration still needed for live verification: Gemini key/model, production hosting/domain/secrets, identity policy and operational recovery/availability targets. No production deployment has been attempted.

## Full production checklist status

Status meanings: **Done** has repository or local test evidence; **Partial** has an implementation but is missing production proof or part of the contract; **Open** needs implementation or an external operational decision; **Blocked** cannot be verified from this workspace.

### P0 - Release blockers

- [ ] 1. CI/CD: **Partial**. Workflow includes Prisma validation/generation, unit tests, PostgreSQL E2E, lint, builds and browser tests; local audit passes. Remote GitHub Actions execution and branch protection are unverified because this checkout has no Git metadata or configured remote.
- [ ] 2. Production configuration: **Partial**. Startup validation, production secret rejection, CORS, rate and retention settings exist; production values, secret storage, documented variable inventory and deployment verification remain open.
- [ ] 3. Authentication strategy: **Partial**. HS256 verification, issuer/audience configuration, key map support and demo-route restrictions exist; production identity integration, refresh/revocation lifecycle and rotation procedure remain open.
- [ ] 4. Authorization and IDOR audit: **Partial**. `docs/AUTHORIZATION-MATRIX.md` and focused HTTP tests now cover owner/admin/anonymous scope, IDOR, exports, reminders, expiry, revocation and forged actors; full route/credential coverage and adversarial suite organization remain open.
- [ ] 5. Database hardening: **Partial**. Separate read-only execution and SQL privilege tests exist; production PostgreSQL version/TLS, dedicated roles, pool/query limits and automated denial checks for every DDL/write privilege remain to be verified in deployment.
- [ ] 6. Backup and recovery: **Partial**. The isolated restore drill now passes for all 12 public tables with matching row counts/content digests; production scheduling, encrypted off-server storage, retention and agreed RPO/RTO remain operational work.
- [ ] 7. Prisma migration discipline: **Partial**. Migrations use `migrate deploy`, CI now checks deployment/status, E2E uses a separate database, and compatibility/rollback rehearsal remains open.
- [ ] 8. Financial correctness: **Done locally**. Decimal boundaries, annualization and recurring-run-rate semantics are tested; production-scale and business sign-off are still needed.
- [ ] 9. Concurrency: **Partial**. Concurrent PATCH, DELETE, bulk, reminder scan and reassignment/delete race tests pass; production load and all mutation combinations remain open.
- [ ] 10. Transaction boundaries: **Partial**. Core writes and reminder persistence are transactional; a complete mutation-to-audit/notification inventory and consistency proof remain open.

### P1 - Security, reliability and operations

- [ ] 11. Rate limiting: **Partial**. PostgreSQL-backed enforcement, category limits and `429`/`Retry-After` semantics are implemented and unit-tested; edge protection, distributed load testing and operational quotas remain open.
- [ ] 12. CORS: **Partial**. Origin allowlisting is configurable and credentials are disabled; production-origin deployment and preflight/negative tests remain open.
- [ ] 13. Security headers: **Partial**. Helmet is enabled; production header verification and CSP compatibility checks remain open.
- [ ] 14. Input validation: **Partial**. DTO validation and focused invalid-input tests exist; a complete external-input matrix including assistant/SSE and extreme values remains open.
- [ ] 15. SQL injection: **Done locally**. Prisma filters are parameterized and read-only SQL enforcement tests exist; a documented raw-query inventory is still useful.
- [ ] 16. CSV security: **Partial**. Formula-prefix escaping, quoting and authorized export are implemented; the full spreadsheet/newline/encoding/content-disposition matrix remains open.
- [ ] 17. Assistant security: **Partial**. Mutation rejection, authorized canonical queries, candidate validation and provider failure handling exist; adversarial isolation, prompt-injection and malformed-model-output coverage remains open.
- [ ] 18. Gemini adapter: **Partial**. Direct live calls now pass with `gemini-3.6-flash`, and the current structured-output API contract is implemented; the compiled HTTP path, 15-30 question evaluation set, provider quota/outage cases and data-retention decision remain open.
- [ ] 19. AI cost controls: **Partial**. Token limits, timeout and configured per-user/global assistant limits exist; enforced quotas, cost telemetry and provider-abuse tests remain open.
- [ ] 20. Prompt/version management: **Partial**. Bounded structured follow-ups and the explicit `intent-schema-v1` contract are implemented and tested; provider evaluation/version rollout procedure remains open.
- [ ] 21. Structured logging: **Partial**. Request ID, route, status, duration and configurable log level are implemented without sensitive request data; centralized retention, release/user correlation and production verification remain open.
- [ ] 22. Error tracking: **Open**. No external error-monitoring integration is configured.
- [ ] 23. Metrics: **Partial**. In-process operational metrics exist; exported API/database/assistant/infrastructure metrics are not deployed or verified.
- [ ] 24. Health checks: **Partial**. Static liveness and database-backed readiness endpoints exist; production dependency scope and monitoring integration remain open.
- [ ] 25. Alerting: **Open**. Thresholds, owners and runbooks are not configured.
- [ ] 26. Containerization: **Partial**. Multi-stage/non-root build, healthcheck and secret-excluding context are present; Docker build/run and image scanning are unverified because Docker is unavailable here.
- [ ] 27. Deployment architecture: **Partial**. Compose, Caddy, backend and frontend services are described; a real staging deployment and scaling/connection plan remain open.
- [ ] 28. HTTPS: **Partial**. Caddy is configured for the deployment shape; certificate issuance, redirect and proxy behavior are unverified.
- [ ] 29. Graceful shutdown: **Partial**. Application shutdown hooks exist; active request, database, SSE and socket shutdown tests remain open.
- [ ] 30. SSE/WebSockets: **Partial**. Authenticated SSE and reminder reconnect/poll recovery exist; disconnect, proxy buffering, idle timeout, concurrency and leak tests remain open.
- [ ] 31. Reminder delivery: **Partial**. Durable unread persistence and post-commit live events exist; failure/reconnect behavior is locally covered but operational delivery guarantees and monitoring remain open.

### P2 - Testing, performance, frontend and documentation

- [ ] 32. Security test suite: **Partial**. Relevant unit/E2E cases exist; the dedicated authentication/authorization/IDOR/injection/rate-limit/CSV/assistant/privilege suite is not organized or complete.
- [ ] 33. Load testing: **Open**. No k6 or equivalent workload, concurrency profile or measured breaking point is recorded.
- [ ] 34. Pagination stress: **Partial**. Cursor ordering and aggregate behavior are tested; 10-to-100,000+ scale evidence is missing.
- [ ] 35. Query performance: **Open**. No recorded `EXPLAIN ANALYZE` review for the important filter, aggregate, assistant and export queries.
- [ ] 36. Database indexes: **Partial**. Schema indexes exist; query-plan justification and production workload verification are missing.
- [ ] 37. Frontend production audit: **Partial**. Build, responsive smoke flow, loading/error paths and main workflows exist; admin/conflict/expiry/429/accessibility/browser coverage remains open.
- [x] 38. Architecture documentation: **Done locally**. [ARCHITECTURE.md](../ARCHITECTURE.md) documents runtime, ledger, assistant, deployment and consistency boundaries.
- [x] 39. Security documentation: **Done locally**. [SECURITY.md](../SECURITY.md) documents authentication, authorization, input/query safety, abuse controls, secrets and incidents.
- [x] 40. Deployment documentation: **Done locally**. [DEPLOYMENT.md](../DEPLOYMENT.md) documents provisioning, roles, migrations, deployment, smoke checks and rollback expectations; execution remains external.
- [x] 41. Disaster recovery documentation: **Done locally**. [DISASTER_RECOVERY.md](../DISASTER_RECOVERY.md) documents targets, backup/restore, incidents and the verified local restore drill; production targets remain to be approved.
- [ ] 42. Operational safety: **Partial**. Audit events, retention configuration and data-minimization decisions exist in part; immutable audit access, retention jobs and privacy review remain open.
- [ ] 43. Fresh-environment release gate: **Open**. A clean checkout, production-like deployment, security/load/smoke verification and rollback drill have not been completed.

### Current active item

**Item 18: Gemini live integration and evaluation.** Direct provider calls pass with the local model configuration. The next step is a clean compiled `/assistant/ask` verification, then a representative safe/ambiguous/follow-up/adversarial question set; no key or provider credential belongs in Git or chat.
