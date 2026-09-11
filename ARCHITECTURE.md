# Architecture

## Runtime flow

The React frontend calls the NestJS API through the deployment reverse proxy. NestJS validates external inputs, authenticates the bearer token, applies authorization scope, and delegates domain work to services and repositories. PostgreSQL is the source of truth for ledger amounts, annualization, optimistic versions, audit events, reminders, notifications, conversations and revocations.

```text
Browser -> Caddy/HTTPS -> NestJS API -> PostgreSQL
                                      -> read-only PostgreSQL transaction (assistant)
```

## Ledger

Line-item reads use the canonical filter, sort, cursor and aggregate repository methods. Owner principals are scoped to their authenticated owner ID. Mutations use optimistic versions and transactions for related audit, reminder and notification changes.

## Assistant

```text
Question -> bounded parser/Gemini intent -> Zod contract -> authorized filters
         -> read-only repeatable-read transaction -> database-calculated answer
```

The model never produces SQL or financial figures. `intent-schema-v1` is the current provider contract. Deterministic parsing remains available when Gemini is disabled or unavailable.

## Deployment components

`deploy/compose.yaml` runs PostgreSQL 18, the backend, Caddy web proxy and a migration service with no profile. Database health gates migration startup; successful migration and role-grant completion gates backend startup; backend health gates web startup. The runtime image is non-root and receives secrets at runtime. PostgreSQL roles are separated into migration, runtime and read-only responsibilities, with explicit table/column grants recorded in [the deployment contract](deploy/DEPLOYMENT_CONTRACT.md).

## Consistency and recovery

Writes and audit records are transactional. Reminder persistence is durable; live socket delivery is best effort and unread notifications provide recovery. PostgreSQL backups and restore drills are operational responsibilities described in `deploy/RUNBOOK.md`.
