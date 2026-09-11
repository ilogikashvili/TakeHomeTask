# Vendor Contracts & Spend

Vendor Contracts & Spend is a full-stack take-home application for tracking subscription spend, contract records, renewal reminders, and a database-backed assistant. The project combines a NestJS + Prisma backend, a React frontend, PostgreSQL persistence, and optional Google Gemini-powered intent interpretation while preserving deterministic local behavior when Gemini is unavailable.

## Features

### Spend ledger
- Filter, search, sort, and page through line items with global aggregates and shareable URL state
- Create, edit, delete, and bulk-apply line-item changes with optimistic concurrency checks
- Download filtered ledger exports and inspect approval history for individual contracts

### Contract records
- Manage contract records with CRUD flows and transactional approval history
- Enforce owner-scoped access and admin cross-owner visibility where intended
- Preserve optimistic locking and activity auditability across updates

### Renewal reminders
- Automatically scan for upcoming renewals and create persisted unread reminder notifications
- Catch up on missed reminders during application startup
- Emit real-time reminder updates to connected clients and synchronize unread state across tabs
- Recover reminders through unread notification retrieval and reconnect-safe UI refreshes

### Assistant
- Query the ledger through `/ask` using natural-language requests
- Resolve vendor names, billing periods, follow-up questions, and clarification steps against the database
- Perform read-only calculations using the read-only database connection and return evidence-backed answers
- Support streaming progress updates and evidence links in the UI
- Fail closed when the assistant’s read-only database configuration is missing

## Tech stack

- NestJS — API layer, auth, validation, domain services, and WebSocket gateway
- React + Vite — frontend application and client-side routing
- PostgreSQL — source of truth for ledger data, approvals, reminders, notifications, and audit records
- Docker Compose — deployment stack for PostgreSQL, backend, migration, and Caddy web proxy
- Framer Motion — UI animation support in the frontend
- LangChain + LangGraph — assistant orchestration and provider abstraction
- Google Gemini — optional live natural-language intent interpretation when configured

## Application routes

| Route | Purpose |
| --- | --- |
| `/ledger` | Spend ledger workspace |
| `/ledger/:id` | Line-item detail, editing, and approval history |
| `/ask` | Assistant interface |
| `/reminders` | Renewal reminders and unread notifications |
| `/` | Optional overview landing page |

The backend also exposes Swagger/OpenAPI documentation at `/docs` when the API server is running.

## Quick start

### Local reviewer path

1. Clone the repository:

```bash
git clone https://github.com/ilogikashvili/TakeHomeTask.git
cd TakeHomeTask
```

2. Prepare the backend environment file:

```bash
copy backend\.env.example backend\.env
```

Update `backend/.env` with your local PostgreSQL settings, JWT secret, and any optional Gemini values. A safe starter configuration is already provided in the example file.

3. Start PostgreSQL and run the backend migrations/seed:

```bash
cd backend
npm install
npx prisma migrate deploy
npm run prisma:generate
npm run prisma:seed
npm run start:dev
```

4. Start the frontend in a second terminal:

```bash
cd frontend
npm install
npm run dev
```

5. Open the app:

- Frontend: `http://127.0.0.1:5173`
- Backend API: `http://127.0.0.1:3000`
- Swagger docs: `http://127.0.0.1:3000/docs`

### Docker deployment path

The repository includes a production-style Compose deployment under `deploy/compose.yaml` for PostgreSQL, migrations, the backend, and a Caddy web proxy. For that path, configure the required environment variables from `deploy/production.env.example`, provide the TLS certificate directories, and run:

```bash
docker compose -f deploy/compose.yaml up --build
```

The Compose stack expects the PostgreSQL TLS materials, migration URL, runtime passwords, and deployment host settings to be injected through environment variables or a host secret manager. The basic local reviewer path above does not require production TLS setup.

## Gemini configuration

Google Gemini is optional. To enable live natural-language intent interpretation, set both environment variables in `backend/.env`:

```bash
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.6-flash
```

If those values are omitted, the application automatically falls back to the deterministic local parser, which remains fully functional for supported ledger and vendor questions.

## Demo data / seed

The repository includes deterministic seed data for local review. The current seed creates:

- approximately 30 owners
- approximately 200 vendors
- approximately 2,500 line items

This data includes a mix of categories, billing periods, renewal dates, approval histories, statuses, and vendor concentration to exercise the relevant workflows.

## Testing

Run the main verification commands from the repository root or the relevant project directory:

```bash
cd backend
npm run lint
npm run build
npm test -- --runInBand
npm run test:e2e -- --runInBand

cd ../frontend
npm run build
```

Key coverage areas include:
- ledger filtering, pagination, sorting, aggregates, export, and bulk operations
- owner/admin authorization behavior and approval lifecycle
- reminder persistence, unread-state recovery, and live notifications
- assistant read-only enforcement, vendor resolution, clarification flows, and follow-up behavior
- browser-level smoke coverage for the frontend workspace and reminder flows

## Security and environment notes

- Keep the repository public and preserve the existing Git remote configuration.
- Do not commit real credentials, private keys, or local environment files.
- Use `backend/.env.example` and `deploy/production.env.example` as the safe starting templates.
- Secrets should be injected through your host environment or secret manager rather than stored in the repository.

## Repository documentation

This README is the primary reviewer-facing document. Additional project docs remain available for reference where they are still useful, including:

- `ARCHITECTURE.md`
- `DEPLOYMENT.md`
- `DISASTER_RECOVERY.md`
- `SECURITY.md`
- `docs/AUTHORIZATION-MATRIX.md`
- `deploy/DEPLOYMENT_CONTRACT.md`
- `deploy/RUNBOOK.md`

## Submission readiness

This repository is intended to be reviewed as a complete take-home submission: a runnable application with the required stack, local setup instructions, a public GitHub remote, and a documented verification path.

## Review note

This branch was created specifically to verify that the repository state still produces a clean CI result after the follow-up fixes and documentation updates were merged.
