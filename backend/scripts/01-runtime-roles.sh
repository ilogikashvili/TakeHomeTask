#!/bin/sh
set -eu

: "${LEDGER_RUNTIME_PASSWORD:?LEDGER_RUNTIME_PASSWORD is required}"
: "${LEDGER_READONLY_PASSWORD:?LEDGER_READONLY_PASSWORD is required}"

psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=runtime_password="$LEDGER_RUNTIME_PASSWORD" \
  --set=readonly_password="$LEDGER_READONLY_PASSWORD" <<'SQL'
-- Bootstrap identities only. The migration service applies explicit table ACLs.
BEGIN;
SELECT format('CREATE ROLE %I LOGIN', name)
FROM (VALUES ('ledger_runtime'), ('ledger_readonly')) AS roles(name)
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = name) \gexec
SELECT format('ALTER ROLE ledger_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', :'runtime_password') \gexec
SELECT format('ALTER ROLE ledger_readonly WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS NOINHERIT PASSWORD %L', :'readonly_password') \gexec
-- NOINHERIT still permits SET ROLE; remove all role memberships.
SELECT format('REVOKE %I FROM %I', parent.rolname, member.rolname)
FROM pg_auth_members m JOIN pg_roles parent ON parent.oid = m.roleid
JOIN pg_roles member ON member.oid = m.member
WHERE member.rolname IN ('ledger_runtime', 'ledger_readonly') \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM ledger_runtime, ledger_readonly', current_database()) \gexec
SELECT format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO ledger_runtime, ledger_readonly', current_database()) \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM ledger_runtime, ledger_readonly;
GRANT USAGE ON SCHEMA public TO ledger_runtime, ledger_readonly;
ALTER ROLE ledger_readonly SET default_transaction_read_only = on;
COMMIT;
SQL
