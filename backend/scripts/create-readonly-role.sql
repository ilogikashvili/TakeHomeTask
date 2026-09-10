-- Run as the database owner. Replace the role/database names for each environment.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'assistant_readonly') THEN
    CREATE ROLE assistant_readonly LOGIN;
  END IF;
END $$;
-- Set a strong password separately (for example with psql's \password command).
ALTER ROLE assistant_readonly LOGIN;
ALTER ROLE assistant_readonly SET default_transaction_read_only = on;
GRANT CONNECT ON DATABASE app TO assistant_readonly;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM assistant_readonly;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM assistant_readonly;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM assistant_readonly;
GRANT USAGE ON SCHEMA public TO assistant_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO assistant_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO assistant_readonly;
