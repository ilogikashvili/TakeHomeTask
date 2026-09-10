# Production readiness review

Reviewed 2026-09-10. **Status: working full-stack demo; not approved for production use with real customer data.**

This assessment uses repository inspection and actual local verification, not completion percentages from earlier AI reviews. “Production-ready” needs a defined deployment, user population, traffic level and recovery commitment; these have not been specified or demonstrated.

## Evidence already available

- Backend: 61 passing unit tests and 49 passing PostgreSQL E2E tests; Prisma validation/generation, migration deployment/status, build and lint pass.
- Frontend: production build and 4 browser tests pass. The suite covers owner/admin flows, optimistic conflict handling, vendor clarification, logout/expired sessions, assistant links, reminders access and mobile rendering.
- E2E tests now migrate and seed a separate `_e2e` database. Development data is not the test target.
- New tests cover invalid nulls, real calendar dates, precision, reference errors, lookup/history authorization and atomic reminder ownership transfer.
- A CI workflow is written. There is no evidence yet of a successful remote CI run, staging release or production deployment.
- Docker's entrypoint was corrected to `dist/src/main.js`, its runtime changed to a non-root user and its build context excludes secrets. Docker is unavailable in this environment, so the image was not built/run here.

## Release gates

| Priority | Gap found in this codebase | Evidence needed to close it |
| --- | --- | --- |
| P0 | Authentication is local HS256 verification plus an opt-in development demo. No issuer/audience checks, key rotation or refresh/revocation lifecycle. WebSocket authentication is checked at connection time only. | Production login integration; invalid issuer/audience, expiry, revoked session and rotation tests across HTTP and active sockets; demo routes unavailable in the deployed environment. |
| P0 | Admin mutation requests still supply `actorId` in request bodies. Owner impersonation is blocked, but an admin can select another recorded actor. | Derive the actor from verified identity or explicitly record both initiating identity and delegated actor; audit tests prove attribution cannot be forged. |
| P0 | Runtime dependency audit reports 12 high-severity dependency paths. Root findings include Faker, Multer and DeepmergeTS. The count includes propagated dependency effects and is not a count of exploitable endpoints. | Update compatible dependencies, keep seed/build dependencies out of runtime where appropriate, evaluate reachable affected behavior and record any unresolved risk decisions. Do not apply blind forced major upgrades. |
- P0 | Dependency audit was previously recorded as an unresolved high-severity risk. A fresh `npm audit --audit-level=high` now reports zero vulnerabilities in both backend and frontend. | Re-run the audit in remote CI and review future lockfile changes; no current dependency blocker is evidenced. |
| P0 | CORS is unrestricted, no application rate limiting is connected, conversation context can grow, and costly exports/provider calls lack per-user quotas. A timeout interceptor exists but is not registered globally. | Explicit production origins and limits; provider cost controls; bounded input/context/query execution; abuse and load tests. |
| P0 | Ledger page and aggregate queries execute separately. CSV traverses multiple queries without a shared snapshot. Existing reminder handover is now atomic, but scanner-versus-reassignment/deletion interleavings are not proven. | Snapshot-consistent reads or explicitly defined consistency semantics; deterministic concurrent-write tests; approved renewal/notification handover behavior. |
| P0 | Health currently reports only a static `ok`. Pino exists but there is no verified operational monitoring or recovery system. | Database readiness checks, error/latency/queue metrics, alerting, log retention, on-call ownership and incident/restart procedures exercised in staging. |
| P0 | No verified HTTPS deployment, production frontend proxy, secret manager, backup schedule, restore drill or release rollback. | Deploy the exact build in staging with restricted database roles; rehearse migration and rollback; restore a backup within agreed recovery targets; verify TLS/SSE/WebSocket behavior. |
| P1 | Swagger setup exists without complete response schemas; amount upper bounds and some conflict/audit semantics remain incomplete. | Explicit API contracts and tests for all invalid input/reference/version cases and mutation audit requirements. |
| P1 | Gemini is implemented as an optional intent adapter, tested with mocks only. Follow-ups use text concatenation and the earlier graph files are unused scaffolding. | Live provider checks, a representative financial-question evaluation set, bounded structured context, and failure/quota/clarification tests. If Gemini is not released, explicitly disable that feature. |
| P1 | Frontend is implemented but browser coverage is one owner smoke path. | Admin/bulk/conflict, clarification, reminder live arrival/dismissal, token-expiry, keyboard/accessibility and supported-browser tests. |
| P1 | CI is configured but unverified remotely, and no full security/release acceptance gate exists. | A green remote pipeline including frontend/backend, migrations, secret/dependency checks and staging smoke tests; reviewed release criteria. |

## Data and business decisions still required

- Decide who may approve, whether approval must be separate from ownership, and how an admin identity maps to an audit actor.
- Define whether dismissed reminders remain dismissed after owner reassignment. Current transfer preserves read/dismissal state.
- Define whether notification delivery means persisted unread records, best-effort live events, or durable guaranteed push. Only the first two exist.
- Agree the meaning of spend: the app returns billing amounts and annualized recurring run rate, not historical payments or prorated period spend.
- Set conversation/audit retention, authorized access and permitted data sent to a model provider. No retention job or audited administrative query-audit interface exists yet.
- Specify availability, expected concurrent users/data volume, acceptable latency, recovery time and acceptable data loss before declaring readiness.

## What does not automatically block production

LangGraph, a model narration layer, caching, Kubernetes and an outbox are not universal prerequisites. Add them when the product requirements or measured operating conditions justify them. If guaranteed push delivery is a contractual requirement, an outbox or equivalent durable retry mechanism becomes a release gate.

The current canonical query builder, decimal storage, owner restrictions and transactional writes are useful foundations. Passing local tests does not establish deployment safety, recovery capability or complete security coverage.

## Recommended order

1. Close identity/audit attribution and dependency risks; define production configuration.
2. Finish consistency, validation and authorization/concurrency edge-case tests.
3. Complete the released assistant/API/UI workflows and live integration verification.
4. Run CI and a staging deployment with production-equivalent settings.
5. Prove backup restoration, monitoring, load behavior and rollback; review the release gates before deployment.

Use [OWASP ASVS](https://github.com/OWASP/ASVS) to structure the security verification; this review is not an ASVS certification. Choose and rehearse an appropriate backup method using the [PostgreSQL backup and restore documentation](https://www.postgresql.org/docs/18/backup.html).

The actionable checklist is [backend/TODO.md](backend/TODO.md). Frontend setup and current browser coverage are documented in [frontend/README.md](frontend/README.md).
