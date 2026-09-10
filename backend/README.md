# Subscription ledger backend

NestJS 11, Prisma 6 and PostgreSQL. The ledger and assistant use the same parameterized filters, sorting, pagination and aggregate queries. PostgreSQL performs financial calculations; amounts are returned as decimal strings.

The current checklist is [TODO.md](TODO.md). A working [React frontend](../frontend/README.md) is now included. Remaining release gates are recorded in [PRODUCTION_READINESS.md](../PRODUCTION_READINESS.md); local tests do not establish production readiness.

Operational references: [architecture](../ARCHITECTURE.md), [security](../SECURITY.md), [authorization matrix](../docs/AUTHORIZATION-MATRIX.md), [deployment](../DEPLOYMENT.md), [disaster recovery](../DISASTER_RECOVERY.md), [remaining work](../REMAINING_WORK.md), and the [release runbook](../deploy/RUNBOOK.md).

## Run locally

Use Node.js 22 and PostgreSQL. From this directory:

```powershell
npm.cmd install
Copy-Item .env.example .env
# Configure DATABASE_URL, READONLY_DATABASE_URL and AUTH_JWT_SECRET in .env.
npx.cmd prisma migrate deploy
npm.cmd run prisma:generate
npm.cmd run prisma:seed
npm.cmd run start:dev
```

The seed creates 30 owners, 200 vendors and 2,500 line items. Treat seeding as a development operation; do not run it against data you need to keep. E2E tests seed a separate database rather than the development database.

The server defaults to port 3000. Swagger is available at `/docs`. Application routes require a bearer token, except health and the explicitly enabled development demo endpoints. For the UI demo, set `ENABLE_DEMO_LOGIN=true` with `NODE_ENV=development`. `GET /auth/demo/owners` and `POST /auth/demo` then provide a 15-minute demo session. They remain unavailable outside development; this is not production identity integration.

Production startup requires a separate `READONLY_DATABASE_URL`, an explicit non-local JWT issuer and signing configuration, explicit non-wildcard CORS origins, and disabled demo login. `GEMINI_API_KEY` and `GEMINI_MODEL` must be configured together; omit both to use the deterministic parser. Store these values through the deployment secret manager rather than committing them to an environment file.

## Authentication and ownership

Tokens contain `sub`, `role` (`owner` or `admin`), `exp`, and an `ownerId` for owners. Verification checks the HS256 signature, JWT header, expiry and required claims. Production configuration rejects the built-in development signing secret.

Owners read and modify their own items, cannot reassign them to other owners, and cannot impersonate another approval actor. Admins can operate across owners. Owner ledger filters always use the authenticated owner scope. Conversations are accessible only to their owning identity, including when an admin supplies a conversation ID.

External identity-provider integration, key rotation and revocation policy remain unfinished. HS256 is the current implementation, not a complete identity system.

## API

| Method | Route | Behavior |
| --- | --- | --- |
| GET | /line-items | Filtered page, next cursor and complete filtered aggregates |
| POST | /line-items | Create a draft item |
| PATCH | /line-items/:id | Version-checked edit and transactional status event |
| DELETE | /line-items/:id?expectedVersion=1 | Version-checked soft deletion |
| POST | /line-items/bulk | Atomic status, reassignment or deletion of 1–100 items |
| GET | /line-items/export | CSV of the complete filtered set, up to 10,000 rows |
| POST | /assistant/ask | Validated read-only interpretation and ledger answer |
| GET | /assistant/stream | Authenticated SSE progress and result |
| GET | /reminders/unread | Unread persisted notifications in the authorized scope |
| PATCH | /reminders/:notificationId/dismiss | Dismiss a notification |
| GET | /health | Health endpoint |
| GET | /auth/me | Verified current identity |
| GET | /owners | Authorized owner lookup |
| GET | /vendors | Shared vendor catalog |
| GET | /line-items/:id/approvals | Authorized activity history |

Ledger filters: `vendorId`, `ownerId`, `category`, `status`, `minAmount`, `maxAmount`, `renewalFrom`, `renewalTo`, and `search`. Pagination uses `cursor` and `limit` (1–100). Sort fields are `amount`, `vendor`, `renewalDate`, `startDate`, `category`, and `status`; directions are `asc` and `desc`.

Each row includes its optimistic-lock `version`. Aggregates ignore the page cursor and include `matchingCount`, `totalAmount`, `annualizedAmount`, `byVendor`, and `byCategory`. Listed billing amounts mix billing periods; `annualizedAmount` normalizes weekly ×52, monthly ×12, quarterly ×4 and annual ×1. This is recurring run rate, not historical payments or date-prorated spend.

Amount cursor values and amount filter parameters remain decimal strings when sent to PostgreSQL. Renewal ordering uses a 9999-12-31 sentinel for missing dates (last ascending, first descending). IDs break ties.

### Bulk actions

```json
{
  "action": "status",
  "items": [{"id": "<line-item UUID>", "expectedVersion": 1}],
  "actorId": "<owner UUID>",
  "status": "ACTIVE"
}
```

Other actions: `reassign` requires `ownerId`; `delete` soft-deletes. Duplicate IDs and batches above 100 are rejected. Any conflict rolls back the entire batch. Audit events record status, owner reassignment and deletion. Admin actors still reference existing Owner records.

CSV uses the same authorized filters and escapes quotes and spreadsheet formula prefixes. It excludes deleted rows and does not silently truncate at the export limit.

## Assistant behavior

The live path is in [assistant.service.ts](src/assistant/assistant.service.ts) and [intent-parser.ts](src/assistant/graph/intent-parser.ts):

1. Reject mutation-shaped requests.
2. Load authorized conversation context when supplied.
3. Interpret into a strict Zod-validated intent.
4. Resolve vendors through authorized database candidates; clarify ambiguity and typos.
5. Resolve supported renewal periods in UTC.
6. Execute the canonical ledger through the read-only database connection.
7. Return database-calculated figures, filters, page IDs and a ledger URL; persist query audit and owner conversation messages.

Supported deterministic examples:

- “How much do we spend?”
- “How much do we spend on Microsoft annually?”
- “Which subscriptions renew next month?”
- “What about next month?” with the previous `conversationId`.

Historical-spend questions require clarification because this database does not contain payment history. Unknown vendors do not silently become unfiltered totals. Partial and typo matches return candidates for confirmation.

`matchingLineItemIds` contains the returned page's IDs. `resultIdsComplete` indicates whether that page contains all matches. `ledgerUrl` opens the implemented frontend ledger with those filters. Clarification candidates can be confirmed using `selectedVendorId` alongside the original question; the backend verifies the selection belongs to the authorized candidate set.

Set both `GEMINI_API_KEY` and `GEMINI_MODEL` to enable the Gemini intent adapter. Without them, the deterministic parser is used. The adapter uses structured JSON output, validates again with Zod, limits output tokens, applies a 10-second request timeout and makes at most two attempts. Provider failure returns an explicit unavailable response. No model-produced SQL is executed.

The Gemini adapter follows [Google's structured-output REST documentation](https://ai.google.dev/gemini-api/docs/generate-content/structured-output?hl=en). Its contract and failure handling are tested with mocked responses, and direct live smoke tests pass with the locally configured `gemini-3.6-flash` model for spend, vendor, renewal and mutation-shaped questions. Full compiled `/assistant/ask` verification and a representative evaluation set remain open. Final answer wording remains deterministic; model explanations and LangGraph orchestration are still pending. The earlier graph-node files are unused scaffolding.

Read-only execution explicitly opens a read-only PostgreSQL transaction with a five-second statement timeout. Configure a separate login with SELECT-only privileges using [create-readonly-role.sql](scripts/create-readonly-role.sql); set its password separately and supply its URL. The assistant fails closed when the read-only URL is missing.

Retention is intentionally limited to operational data. The scheduled prune job removes stale `QueryAudit` rows and stale `AssistantConversation` records older than the configured retention window, but it never deletes live financial records, approval history, or reminder/notification state. The retention policy is an operational cleanup policy, not a business-data purge.

SSE uses bearer authentication in the request header, not a token in the URL. It emits an initial progress event followed by a result or sanitized error. This is coarse progress streaming, not model token streaming.

## Reminders and operations

The database enforces uniqueness on `(lineItemId, renewalDate)`. Reminder insertion and persisted notification creation share one transaction. Failure rolls both back; retries can safely insert again. WebSocket events are emitted after commit. This provides idempotent persistence, not guaranteed exactly-once delivery to disconnected clients; unread notifications provide recovery.

Pino logs request ID, method, route template, status and duration. It does not log authorization headers, request bodies or assistant questions. Helmet, CORS, validation, sanitized errors and request IDs are configured in `bootstrap.ts`; `main.ts` adds Swagger and graceful shutdown. Production origins and rate limits still need configuration.

## Verification

```powershell
npm.cmd test -- --runInBand
npm.cmd run test:e2e -- --runInBand
npm.cmd run build
npm.cmd run lint
```

The expanded suites cover all ledger sort directions, page totals, filtered group totals, decimal boundaries, lifecycle conflicts, owner isolation, bulk rollback, reminder partial failure and retry, read-only SQL enforcement, assistant follow-up isolation, ledger links, CSV escaping and SSE delivery.

E2E tests run serially against a dedicated `*_e2e` database, apply migrations, seed it, and create/clean up mutation fixtures. Fixed response-count assertions have been replaced with database expectations. Create the separate database once with the application role as owner, or provide `TEST_DATABASE_ADMIN_URL` for first-run creation. The test runner refuses to seed the configured application database, even if an alternate username is supplied.

The repository includes [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), covering Prisma validation/generation, migration deployment/status, unit tests, isolated PostgreSQL E2E tests, backend lint/build, and frontend build/browser tests. The workflow is written but has not run remotely. Local checks pass: 61 unit tests, 54 PostgreSQL E2E tests, 4 browser tests, both builds, backend lint and high-severity dependency audits. Direct live Gemini adapter smoke tests pass locally; credentials remain ignored and must not be committed.
