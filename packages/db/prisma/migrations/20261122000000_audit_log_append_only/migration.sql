-- Migration: 20261122000000_audit_log_append_only
-- Purpose: Enforce append-only immutability on audit_logs at the database level

-- 1. Create a trigger function that aborts any UPDATE or DELETE attempt
CREATE OR REPLACE FUNCTION enforce_audit_logs_append_only()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Audit logs are strictly append-only. UPDATE and DELETE operations are forbidden.';
END;
$$ LANGUAGE plpgsql;

-- 2. Attach BEFORE UPDATE trigger to audit_logs
DROP TRIGGER IF EXISTS audit_logs_immutable_update ON "audit_logs";
CREATE TRIGGER audit_logs_immutable_update
BEFORE UPDATE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_logs_append_only();

-- 3. Attach BEFORE DELETE trigger to audit_logs
DROP TRIGGER IF EXISTS audit_logs_immutable_delete ON "audit_logs";
CREATE TRIGGER audit_logs_immutable_delete
BEFORE DELETE ON "audit_logs"
FOR EACH ROW
EXECUTE FUNCTION enforce_audit_logs_append_only();

-- 4. Revoke UPDATE, DELETE, and TRUNCATE privileges on audit_logs from PUBLIC
REVOKE UPDATE, DELETE, TRUNCATE ON "audit_logs" FROM PUBLIC;
