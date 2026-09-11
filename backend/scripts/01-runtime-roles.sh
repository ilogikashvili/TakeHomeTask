#!/bin/sh
set -eu

: "${LEDGER_RUNTIME_PASSWORD:?LEDGER_RUNTIME_PASSWORD is required}"
: "${LEDGER_READONLY_PASSWORD:?LEDGER_READONLY_PASSWORD is required}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=runtime_password="$LEDGER_RUNTIME_PASSWORD" \
  --set=readonly_password="$LEDGER_READONLY_PASSWORD" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_runtime') THEN
    CREATE ROLE ledger_runtime LOGIN PASSWORD :'runtime_password';
  ELSE
    ALTER ROLE ledger_runtime WITH LOGIN PASSWORD :'runtime_password';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledger_readonly') THEN
    CREATE ROLE ledger_readonly LOGIN PASSWORD :'readonly_password';
  ELSE
    ALTER ROLE ledger_readonly WITH LOGIN PASSWORD :'readonly_password';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE ledger TO ledger_runtime;
GRANT CONNECT ON DATABASE ledger TO ledger_readonly;
GRANT USAGE ON SCHEMA public TO ledger_runtime;
GRANT USAGE ON SCHEMA public TO ledger_readonly;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ledger_runtime;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ledger_runtime;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO ledger_readonly;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledger_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ledger_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ledger_runtime;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO ledger_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ledger_readonly;
SQL