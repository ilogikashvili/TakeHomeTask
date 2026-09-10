# Security

## Authentication

Application tokens are HS256 JWTs with pinned algorithm, issuer, audience, expiry, issued-at, JTI, role and owner mapping claims. Access tokens last at most 15 minutes. Logout stores the JTI in the revocation table. Signing-key overlap is supported with `AUTH_JWT_KEYS` and `AUTH_JWT_ACTIVE_KEY`; rotate keys by overlapping deployments and retire compromised keys immediately.

Production does not enable demo login. A production identity provider or controlled issuer must map every mutating principal, including administrators, to an existing audit actor. Refresh tokens are intentionally not implemented; expired sessions require reauthentication by the identity system.

## Authorization and data isolation

Owners are scoped to their own line items, reminders, conversations and approval history. Administrators can operate across owners but mutation audit actors must match their authenticated mapped owner ID. The API rejects mismatched body actor IDs, foreign owner writes and unauthorized conversation or line-item references.

## Input and query safety

Nest validation rejects unknown properties and malformed UUIDs, dates, enums, decimals and pagination. Prisma parameters filters and the assistant executes through a read-only PostgreSQL transaction. No model-produced SQL is executed. CSV fields are quoted and spreadsheet formula prefixes are neutralized.

## Abuse controls

PostgreSQL-backed quota buckets enforce general and assistant-specific limits. Over-limit responses are `429` with `Retry-After`. Configure edge/IP protection at the reverse proxy as well; application quotas are not a substitute for network abuse protection.

## Secrets and production configuration

Production startup requires TLS database URLs, a separate read-only database URL, explicit signing configuration, non-wildcard CORS origins and disabled demo login. Secrets belong in the deployment secret manager and must not be committed to environment files or images.

## Reporting and operations

Do not disclose credentials or customer data in issues. Preserve request IDs and sanitized logs, revoke affected signing keys, rotate database/provider credentials, restrict access, and follow the incident and restoration procedures in `deploy/RUNBOOK.md`.
