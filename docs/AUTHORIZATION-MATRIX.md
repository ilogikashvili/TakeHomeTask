# Authorization Matrix

Reviewed: 2026-09-10

## Actors

- **Anonymous**: no bearer token, invalid token, expired token, or revoked token.
- **Owner A**: authenticated owner whose `ownerId` is A.
- **Owner B**: authenticated owner whose `ownerId` is B.
- **Admin**: authenticated administrator with a mapped audit actor.

## Policy

- Protected routes require a valid, non-revoked bearer token.
- Owners are always scoped to their authenticated `ownerId`; client `ownerId` filters cannot widen that scope.
- Administrators may operate across owners where the endpoint supports cross-owner administration.
- Foreign line-item and approval objects are hidden from owners with `404`.
- Optimistic-lock conflicts return `409`.
- Owner mutation attempts that cross owner boundaries or forge an audit actor return `403`.
- Admin reminder operations require an explicit target `ownerId` query parameter.
- Conversation records remain owned by their original owner; an administrator does not automatically gain conversation access.
- Vendor catalog access is shared to authenticated users because vendors are reference data, not owner-private records.

## Endpoint matrix

Legend: `200/201` means authorized success; `401` means authentication required or invalid; `403` means authenticated but forbidden; `404` means the resource is intentionally hidden; `409` means an optimistic-lock conflict.

| Resource/action | Anonymous | Owner A: own | Owner A: Owner B data | Owner B: own | Admin | Evidence |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| `GET /line-items` | `401` | `200` | Scope cannot widen | `200` | `200` | E2E ledger authorization tests |
| `POST /line-items` for A | `401` | `201` | `403` | `201` for B | `201` | Lifecycle E2E tests |
| `PATCH /line-items/:id` | `401` | `200` | `409/404` | `200` | `200` | Lifecycle and race tests |
| `DELETE /line-items/:id` | `401` | `200` | `404` | `200` | `200` | Lifecycle E2E tests |
| `POST /line-items/bulk` | `401` | Own items only | `403` on foreign reassignment | Own items only | Cross-owner | Bulk rollback/authorization tests |
| `GET /line-items/export` | `401` | Own rows only | Cannot widen with `ownerId` | Own rows only | Filtered cross-owner | Export authorization tests |
| `GET /line-items/:id/approvals` | `401` | Own item | `404` | Own item | Any item | Approval authorization tests |
| `GET /reminders/unread` | `401` | Own reminders; supplied owner scope ignored | Cannot widen | Own reminders | Requires `ownerId` | Reminder scope tests |
| `PATCH /reminders/:id/dismiss` | `401` | Own notification | `404` | Own notification | Target owner scope | Reminder authorization tests |
| `POST /assistant/ask` | `401` | Own authorized ledger | Foreign IDs rejected/hidden | Own authorized ledger | Authorized ledger policy | Assistant isolation tests |
| `GET /assistant/stream` | `401` | Own authorized ledger | Foreign conversation rejected | Own authorized ledger | Authorized ledger policy | SSE auth tests |
| `GET /owners` | `401` | Own owner record | Cannot enumerate | Own owner record | All owners | Catalog authorization tests |
| `GET /vendors` | `401` | Shared catalog | Shared catalog | Shared catalog | Shared catalog | Catalog authorization tests |
| `GET /auth/me` | `401` | Own identity | N/A | Own identity | Own admin identity | Auth tests |
| `POST /auth/logout` | `401` | Revokes own token | N/A | Revokes own token | Revokes own token | Revocation tests |

## Token abuse matrix

| Credential/input | Expected result |
| --- | --- |
| Missing bearer token | `401` |
| Malformed token | `401` |
| Expired token | `401` |
| Revoked token | `401` |
| Valid signature with wrong issuer | `401` |
| Valid signature with wrong audience | `401` |
| Owner token with forged `ownerId` | Token claims are validated; foreign access is denied/hidden |
| Mutation with forged `actorId` | `403`; no mutation or audit event is written |
| Admin mutation with a different `actorId` | `403`; no mutation or audit event is written |
| Admin reminder request without `ownerId` | `400` |
| Assistant request naming another owner | No foreign data; refusal, clarification, or authorized empty result |

## Required test evidence

The matrix is complete only when HTTP tests cover:

1. Anonymous, owner A, owner B, admin, expired and revoked credentials.
2. Direct object IDs and filter parameters.
3. Reads, writes, exports, approvals, reminders, assistant requests and SSE.
4. Forged owner and audit actor fields.
5. No mutation or audit record after a rejected request.
6. Consistent documented `401`, `403`, `404` and `409` behavior.
