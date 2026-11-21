# Operational Runbook: Elder Care Platform

This runbook describes standard operating procedures for critical operational scenarios, outages, and emergency workflows in compliance with Section 10 of `Goal.md`.

---

## 1. Database Migration Failure

### Symptoms:
- Deployment failure during `pnpm db:migrate` or Prisma schema sync.
- Logs: `P3009: Migrate found failed migrations in the target database`.

### Procedure:
1. **Inspect Failed Migration State**:
   ```bash
   pnpm --filter @elder-care/db exec prisma migrate status
   ```
2. **Rollback / Resolution**:
   - If the migration partially executed, connect to PostgreSQL directly using `psql` or pgAdmin.
   - Revert partially applied SQL changes manually or fix the offending DDL constraint.
   - Mark the migration resolved:
     ```bash
     pnpm --filter @elder-care/db exec prisma migrate resolve --rolled-back <migration_name>
     ```
3. **Re-apply**:
   ```bash
   pnpm --filter @elder-care/db migrate
   ```

---

## 2. Downstream Email Provider Outage (Resend / Mailpit)

### Symptoms:
- Dose reminders or caregiver escalation alerts failing.
- Logs: `Failed to send email to user@...` with `status: FAILED` in `NotificationLog`.

### Procedure:
1. **Check Provider Health**:
   - For production (Resend): Verify https://status.resend.com.
   - For local development: Verify Mailpit is running on `http://localhost:8025`.
2. **Queue Resilience**:
   - BullMQ worker automatically retains failed notification jobs with exponential backoff retries (3 attempts).
   - Once the email provider recovers, failed jobs automatically reprocess.
3. **Manual Queue Drain / Resend**:
   - Critical dose escalations that exceeded 3 retries can be queried from `NotificationLog`:
     ```sql
     SELECT * FROM notification_logs WHERE status = 'FAILED' AND type = 'CRITICAL_ESCALATION';
     ```
   - Resend failed records using the worker's retry utility.

---

## 3. Worker or Redis Failure

### Symptoms:
- Scheduled reminders or daily 14-day dose generations not executing.
- Web app logs: `Redis connection error; fallback to memory store`.

### Procedure:
1. **Web App Continuity**:
   - The Next.js web application will continue serving Senior Mode and Care Circle Dashboard normally because authorization and sessions reside in PostgreSQL. Rate limiting automatically falls back to in-memory tracking.
2. **Restart Redis**:
   ```bash
   docker compose restart redis
   ```
3. **Restart Worker Process**:
   ```bash
   pnpm dev:worker
   ```
4. **Verify Repeatable Schedules**:
   - Inspect queue repeatable jobs:
     ```bash
     docker exec -it eldercare_redis redis-cli keys "bull:eldercare-reminders:*"
     ```

---

## 4. Elder Lost Passcode (Kitchen Tablet Locked)

### Symptoms:
- Elder entered wrong PIN 5 times and is locked out of Senior Mode on the shared kitchen tablet.
- Screen message: `Passcode locked due to multiple failed attempts`.

### Procedure:
1. **Primary Account Sign-In**:
   - Passcodes are strictly an auxiliary unlock mechanism for shared devices; an active account session is always required.
   - The elder or caregiver can sign in using their full email and password credentials, bypassing the PIN lock.
2. **Reset Passcode**:
   - In Care Circle settings or via server action, the Owner can set a new 4–6 digit PIN:
     ```typescript
     await setMemberPasscode(membershipId, '1234');
     ```
   - This immediately clears `passcodeFailures` and `passcodeLockedUntil`.

---

## 5. Emergency Access Request (Clinic / First Responder)

### Scenario:
First responder or clinic emergency room requires immediate access to allergies, blood type, and current prescriptions when the elder is unconscious or cannot operate their device.

### Procedure:
1. **Locate Printed Emergency Card**:
   - Retrieve the physical Emergency Card from the elder's wallet or bedside.
   - Find the 8-character code (e.g. `EMRG8821`).
2. **Access URL**:
   - Open browser to `https://<domain>/profiles/<id>/emergency?code=EMRG8821`.
3. **Audit Verification**:
   - Access via emergency code is logged in `AuditLog` with action `EMERGENCY_CARD:VIEW` and the requestor's IP address.
   - Emergency access is strictly read-only; no prescriptions or schedules can be edited via the emergency view.
4. **Code Rotation After Discharge**:
   - After discharge from emergency care, the Owner can rotate the emergency code with one tap from the dashboard, invalidating the previous code.
