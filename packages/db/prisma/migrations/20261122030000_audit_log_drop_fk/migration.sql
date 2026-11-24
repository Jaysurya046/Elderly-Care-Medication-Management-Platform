-- Migration: 20261122030000_audit_log_drop_fk
-- Purpose: Drop foreign key from audit_logs to care_profiles to ensure immutable audit logs remain intact upon profile deletion without violating the append-only trigger.

-- Drop foreign key constraint
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_profileId_fkey";
