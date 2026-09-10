# Production readiness review

Reviewed 2026-09-10. **Status: working full-stack demo; not approved for production use with real customer data.**

This document is the assessment and evidence report for the repository. It explains the current state, the gaps, and the rationale for the release decision. It is not the operational release control document; for release approval gates and execution sequencing, use [REMAINING_WORK.md](REMAINING_WORK.md).

This assessment uses repository inspection and actual local verification, not completion percentages from earlier AI reviews. “Production-ready” needs a defined deployment, user population, traffic level and recovery commitment; these have not been specified or demonstrated.

## Evidence already available

- Backend: 61 passing unit tests and 49 passing PostgreSQL E2E tests; Prisma validation/generation, migration deployment/status, build and lint pass.
- Frontend: production build and 4 browser tests pass. The suite covers owner/admin flows, optimistic conflict handling, vendor clarification, logout/expired sessions, assistant links, reminders access and mobile rendering.
- E2E tests now migrate and seed a separate `_e2e` database. Development data is not the test target.
- New tests cover invalid nulls, real calendar dates, precision, reference errors, lookup/history authorization and atomic reminder ownership transfer.
- A CI workflow is written. There is no evidence yet of a successful remote CI run, staging release or production deployment.
- Docker's entrypoint was corrected to `dist/src/main.js`, its runtime changed to a non-root user and its build context excludes secrets. Docker is unavailable in this environment, so the image was not built/run here.

## Release gates

| Priority | Current assessment | Evidence needed to close it |
| --- | --- | --- |
| P0 | Historical finding — resolved: earlier review identified missing issuer/audience checks, rotation support and refresh/revocation lifecycle. The current implementation validates HS256 issuer/audience, JTI, expiry, and key rotation/revocation semantics, with dedicated tests covering the HTTP boundary and rotated/retired keys. | Production decision record for the signing model, rotation cadence, incident procedure, and live deployment verification. |
| P0 | Historical finding — resolved: earlier review noted that admin mutation requests could still supply `actorId` in request bodies. The current implementation derives the authenticated actor from the verified identity and rejects forged admin actor IDs; authorization tests cover the HTTP boundary and actor attribution. | Final audit review with the data owner and deployment verification on the chosen identity model. |
| P0 | Historical finding — resolved: earlier dependency audit identified 12 high-severity dependency paths. A fresh `npm audit --audit-level=high` now reports zero high-severity vulnerabilities in both backend and frontend. | Remote CI must reproduce the audit result and future lockfile changes must be reviewed. |
| P0 | Historical finding — resolved: earlier review described unrestricted CORS and no application rate limiting. The current implementation uses explicit configurable origins and PostgreSQL-backed request quotas with `429` and `Retry-After` behavior. | Edge/IP protection, production quotas, multi-instance testing, and abuse/legitimate traffic validation. |
| P0 | Historical finding — resolved: earlier review identified static health only. The current implementation includes liveness and database-readiness checks. | Production monitoring, alerting, and runbooks for readiness and dependency failures. |
| P0 | Current issue: deployment proof remains pending. The app validates production settings, rejects unsafe defaults, and exposes explicit CORS and quota configuration, but staging deployment and live configuration verification are still open. | Real environment values, secret manager, staging deployment, startup validation evidence, and production origin verification. |
| P0 | Current issue: snapshot consistency is not yet explicitly decided for aggregated reads and CSV export under concurrent writes. | Choose same-transaction snapshot semantics or document explicit eventual semantics, then verify concurrent-write scenarios and publish the contract. |
| P0 | Current issue: HTTPS, proxy behavior, database roles, migrations, restore rehearsal, and rollback behavior are not yet demonstrated in a real deployment environment. | Staging deployment, TLS/proxy tests, DB role enforcement, backup/restore drill, migration failure rehearsal, and rollback rehearsal. |
| P1 | Current issue: final API response contracts and complete HTTP-boundary coverage remain to be completed. | Full schema review and edge-case validation for all routes, including assistant, CSV, and admin flows. |
| P1 | Historical finding — resolved: earlier review treated Gemini as mocked and unverified. The current implementation includes live `gemini-3.6-flash` smoke tests and a corrected structured-output contract. | Compiled `/assistant/ask` evaluation set, provider policy record, and outage/timeout/invalid-output handling. |
| P1 | Current issue: browser coverage is strong locally but still needs production-state verification. | Final frontend release suite, accessibility checks, production-state testing, and UX failure-path coverage. |
| P1 | Current issue: CI is defined but not yet observed in GitHub Actions, and branch protection is not yet configured. | Remote CI green run, required checks, and protected branch setup. |

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
