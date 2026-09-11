# Deployment

1. Provision PostgreSQL 18 with TLS, encrypted backups and separate migration, runtime and read-only roles. See the [version and privilege decision](deploy/DEPLOYMENT_CONTRACT.md). Compose uses the PostgreSQL 18 volume layout; do not reuse a PostgreSQL 16 data volume without a reviewed upgrade.
2. Bootstrap roles with `backend/scripts/01-runtime-roles.sh` as the administrator (automatic on a fresh Compose database). The existing migration service applies `backend/scripts/runtime-grants.sql` after migrations, using the same schema owner. Existing databases require explicit initializer reapplication while application traffic is stopped.
3. Configure production secrets from `deploy/production.env.example`; set `PUBLIC_HOST`, `MIGRATION_DATABASE_URL`, `POSTGRES_TLS_DIR` and `POSTGRES_CA_DIR` outside committed files. Supply an approved internal-CA certificate for DNS name `db`: `server.crt`/`server.key` in the restricted server directory, and only public `ca.crt` in the separate trust directory. Mounts are read-only; no certificate or private key is included in Git/images.
4. Build immutable backend and web images with `docker compose -f deploy/compose.yaml build`.
5. Apply migrations and role grants with `docker compose -f deploy/compose.yaml run --rm migrate`. Never use `prisma db push` in production.
6. Start services with `docker compose -f deploy/compose.yaml up -d`. Compose requires database health, then successful migration/grant completion before backend startup; web waits for backend health.
7. Verify `/health`, `/health/ready`, HTTPS redirect/certificate, SPA routes, authenticated CRUD/export, SSE, sockets, logout and production demo-route rejection.
8. Record image digests, migration version, deployment ID and operator. Keep the previous compatible image available for rollback.

The repository does not claim a completed public deployment. Staging must prove TLS, proxy buffering, graceful shutdown, database permissions, backup restore and rollback before production traffic.

The bundled database enables TLS 1.2+ and uses an HBA policy that rejects non-TLS TCP and requires SCRAM. It does not publish port 5432 on the host. Runtime/migration Prisma URLs require `sslmode=require&sslaccept=strict&sslcert=/etc/ledger/db-trust/ca.crt`; the readonly node-postgres URL uses `sslmode=require&sslrootcert=/etc/ledger/db-trust/ca.crt`. Production environment validation is unchanged. Caddy's HTTPS configuration is independent of database TLS.

Replace matching server certificates/keys before expiry, preserving PostgreSQL-readable restrictive key permissions, then reload PostgreSQL and verify new connections. For CA replacement, distribute overlapping public CA bundles and recreate backend to reload trust before switching the server certificate. See the [release runbook](deploy/RUNBOOK.md#postgresql-tls-certificates-and-connections) for certificate source, permissions, rotation and verification. No real staging host has been provisioned or deployed.
