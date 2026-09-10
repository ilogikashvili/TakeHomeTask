# Deployment

1. Provision PostgreSQL 18 with TLS, encrypted backups and separate migration, runtime and read-only roles.
2. Apply `backend/scripts/create-readonly-role.sql` as the database owner and grant runtime permissions explicitly.
3. Configure production secrets from `deploy/production.env.example`; set `PUBLIC_HOST` and `MIGRATION_DATABASE_URL` outside committed files.
4. Build immutable backend and web images with `docker compose -f deploy/compose.yaml build`.
5. Apply migrations with `docker compose -f deploy/compose.yaml --profile maintenance run --rm migrate`. Never use `prisma db push` in production.
6. Start services with `docker compose -f deploy/compose.yaml up -d backend web`.
7. Verify `/health`, `/health/ready`, HTTPS redirect/certificate, SPA routes, authenticated CRUD/export, SSE, sockets, logout and production demo-route rejection.
8. Record image digests, migration version, deployment ID and operator. Keep the previous compatible image available for rollback.

The repository does not claim a completed public deployment. Staging must prove TLS, proxy buffering, graceful shutdown, database permissions, backup restore and rollback before production traffic.
