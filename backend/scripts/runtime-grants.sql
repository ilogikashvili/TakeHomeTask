-- Run as the same owner that applies Prisma migrations. Fail closed on missing
-- tables. New tables receive no automatic application access. Column-limited
-- grants do not expand to future columns; review all ACLs with schema changes.
BEGIN;
-- Existing volumes do not rerun the entrypoint. Refuse unsafe/unbootstrapped
-- identities rather than reporting successful grants for an elevated login.
DO $$ BEGIN
  IF (SELECT count(*) FROM pg_roles WHERE rolname IN ('ledger_runtime', 'ledger_readonly')) <> 2
    OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('ledger_runtime', 'ledger_readonly')
      AND (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls))
    OR EXISTS (SELECT FROM pg_auth_members WHERE member IN
      (SELECT oid FROM pg_roles WHERE rolname IN ('ledger_runtime', 'ledger_readonly')))
    OR EXISTS (SELECT FROM pg_class WHERE relowner IN
      (SELECT oid FROM pg_roles WHERE rolname IN ('ledger_runtime', 'ledger_readonly')))
    OR EXISTS (SELECT FROM pg_roles WHERE rolname IN ('ledger_runtime', 'ledger_readonly')
      AND (has_schema_privilege(oid, 'public', 'CREATE')
        OR has_database_privilege(oid, current_database(), 'CREATE')
        OR has_database_privilege(oid, current_database(), 'TEMPORARY')))
  THEN RAISE EXCEPTION 'Restricted role bootstrap required before applying deployment grants';
  END IF;
END $$;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, ledger_runtime, ledger_readonly;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, ledger_runtime, ledger_readonly;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, ledger_runtime, ledger_readonly;
-- Table REVOKE does not remove column grants.
DO $$ DECLARE t record; BEGIN
  FOR t IN SELECT c.relname, string_agg(quote_ident(a.attname), ', ') AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
      AND a.attnum > 0 AND NOT a.attisdropped GROUP BY c.relname
  LOOP
    EXECUTE format('REVOKE ALL (%s) ON TABLE public.%I FROM PUBLIC, ledger_runtime, ledger_readonly', t.columns, t.relname);
  END LOOP;
END $$;
-- Clear both global and schema defaults for the migration owner.
ALTER DEFAULT PRIVILEGES REVOKE ALL ON TABLES FROM PUBLIC, ledger_runtime, ledger_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, ledger_runtime, ledger_readonly;
ALTER DEFAULT PRIVILEGES REVOKE ALL ON SEQUENCES FROM PUBLIC, ledger_runtime, ledger_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, ledger_runtime, ledger_readonly;
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ledger_runtime, ledger_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, ledger_runtime, ledger_readonly;

-- Prisma returns complete records; runtime SELECT is table-wide.
GRANT SELECT ON "Owner", "LineItem", "ApprovalEvent", "Reminder",
  "Notification", "QueryAudit", "AssistantConversation", "AssistantMessage",
  "RevokedToken", "UsageBucket" TO ledger_runtime;
GRANT SELECT ("id", "name", "category") ON "Vendor" TO ledger_runtime;
GRANT INSERT ON "LineItem", "ApprovalEvent", "Reminder", "Notification",
  "QueryAudit", "AssistantConversation", "AssistantMessage", "RevokedToken",
  "UsageBucket" TO ledger_runtime;
GRANT UPDATE ("ownerId", "name", "category", "description", "billingPeriod",
  "amount", "startDate", "endDate", "renewalDate", "status", "version",
  "deletedAt", "updatedAt") ON "LineItem" TO ledger_runtime;
GRANT UPDATE ("ownerId", "dismissedAt") ON "Reminder" TO ledger_runtime;
GRANT UPDATE ("ownerId", "readAt") ON "Notification" TO ledger_runtime;
GRANT UPDATE ("updatedAt") ON "AssistantConversation" TO ledger_runtime;
GRANT UPDATE ("count") ON "UsageBucket" TO ledger_runtime;
-- Retention only. Conversation deletion cascades to messages without a direct
-- DELETE grant on AssistantMessage. Ledger deletion is a soft UPDATE.
GRANT DELETE ON "QueryAudit", "AssistantConversation", "RevokedToken", "UsageBucket" TO ledger_runtime;

-- Canonical assistant page/aggregate SQL and filters (description search).
-- Owner resolution and vendor clarification use the runtime connection.
GRANT SELECT ("id", "version", "vendorId", "ownerId", "name", "category",
  "status", "billingPeriod", "amount", "startDate", "endDate", "renewalDate",
  "deletedAt", "description") ON "LineItem" TO ledger_readonly;
GRANT SELECT ("id", "name") ON "Vendor" TO ledger_readonly;
-- UUID/text keys: no sequences. Neither login can access _prisma_migrations.
COMMIT;
