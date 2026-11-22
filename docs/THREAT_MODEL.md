# Threat Model: Elder Care & Medication Management Platform

Following Section 8 and Section 10 of `Goal.md`, this document outlines the threat landscape, security boundaries, attacker personas, mitigations, and data retention rules.

---

## 1. System Assets

1. **Patient Identifiable Information (PII) & Protected Health Information (PHI)**:
   - Elder profiles, dates of birth, conditions, blood type, known allergies, medical notes.
2. **Medication & Schedule Records**:
   - Prescription names, dosage strengths, timing, criticality, adherence logs.
3. **Authentication & Authorization Credentials**:
   - User password hashes (Argon2id), member PIN hashes, TOTP secret keys, opaque session IDs.
4. **Access Control Grants**:
   - Care circle memberships and granular scopes (`view_medications`, `manage_medications`, `view_private_items`, etc.).
5. **Audit Logs**:
   - Append-only records of every health data read, modification, grant change, export, and deletion.

---

## 2. Threat Actors & Personas

- **Malicious External Attacker**: Seeks unauthorized access to patient data, credential stuffing on login, or brute-force guessing of numeric passcodes and emergency codes.
- **Untrusted / Compromised Caregiver**: A caregiver with revoked access attempting to continue viewing or modifying medications, or attempting to view private notes not authorized by the elder.
- **Shoulder Surfer / Physical Device Intruder**: An unauthorized individual attempting to unlock the elder's shared tablet in the kitchen.
- **Rogue / Compelled Third Party**: Demands data without elder's consent.

---

## 3. Threat Matrix & Mitigations (STRIDE)

| Threat Category | Specific Threat | Severity | Technical Mitigation |
|---|---|---|---|
| **Spoofing** | Brute-force guessing of 4–6 digit member passcodes on shared tablet | High | Redis-backed rate limiting (max 5 failed attempts per 15 mins). On 5th failure, automatic lockout cooldown. Requires an active account session first. |
| **Tampering** | Concurrent dose submission causing stock count double-decrement | High | Database transaction with conditional check (`WHERE status = 'PENDING' AND stockCount > 0`). First transition succeeds; second receives `ALREADY_RECORDED`. Stock floor clamped at zero (`Math.max(0, currentStock - 1)`). |
| **Repudiation** | Denying an unauthorized health data modification or grant change | High | Append-only `AuditLog` table. Application role has insert-only rights. Logs actor user, membership, timestamp, action, and anonymized/hashed IP. |
| **Information Disclosure** | Email reminder snooping (leakage of diagnoses or cancer/mental health medicines) | High | Emails safe by default: "You have medicines due at 8:00 AM. Open the app to see them." Medicine names only sent if elder explicitly opts in per profile (`emailShowsMedicineNames = true`). |
| **Information Disclosure** | Leakage of private appointments/notes to caregivers | High | Database queries filter on `isPrivate = false` unless membership has explicit `view_private_items` scope or is profile `OWNER`. |
| **Elevation of Privilege** | Revoked caregiver using stale token/session to modify prescriptions | Critical | Database-checked membership on every request (`requireProfileAccess`). Stateless JWTs prohibited. Immediate revocation on next HTTP request. Enforced via TypeScript AST parser requiring `requireProfileAccess` across all profile route handlers. |
| **Tampering** | Circumventing audit log entries or deleting historical records | Critical | Append-only database trigger `enforce_audit_logs_append_only()` raises PostgreSQL exception on any UPDATE or DELETE statement. Table mutation privileges are revoked from PUBLIC. |
| **Tampering / CSRF** | Cross-site request forgery triggering medication state changes | High | Origin/host header validation on all state-changing HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`). Cross-origin requests rejected with 403 Forbidden. Strict CSP and HSTS headers. |
| **Denial of Service** | Brute force or distributed resource starvation when Redis fails | High | Rate limiter fails closed in production (503 Service Unavailable). In-memory fallback is restricted strictly to test/development environments. |
| **Information Disclosure** | Unhandled server exceptions leaking database connection strings or stack traces | High | Input validated via shared Zod schemas (400 field-level errors). Unhandled exceptions logged via Pino and sanitized to return a generic message with an opaque `requestId`. |
| **Denial of Service** | Flooding notification worker or database | Medium | BullMQ idempotent job IDs and `NotificationLog.referenceKey` prevent duplicate emails. Digest grouping consolidates same-time doses into 1 email. |

---

## 4. Cryptographic Standards

- **Passwords & Passcodes**: Argon2id (`@node-rs/argon2`) with 19MB memory cost, 2 iterations.
- **TOTP Secrets & At-Rest Encryption**: AES-256-GCM with unique 12-byte initialization vectors (IV) and authentication tags, using 256-bit key from `APP_ENCRYPTION_KEY`.
- **Session Tokens**: 32-byte cryptographically secure random hexadecimal strings stored in PostgreSQL session table with `httpOnly`, `Secure`, `SameSite=Lax` cookies.
- **Invitation Tokens**: 32-byte single-use random tokens hashed with SHA-256 before storage in database; raw token never stored.

---

## 5. Data Retention & Erasure Policies

- **Account & Profile Deletion Grace Period**:
  - Upon user request, `deletionRequestedAt` is set to 30 days in the future.
  - During the 30-day grace period, the elder or owner can cancel the deletion request.
  - After 30 days, all health data, schedules, medications, and notes are hard-deleted.
- **Audit Log Retention**:
  - Audit records (`AuditLog`) are retained for a minimum of 7 years in accordance with applicable healthcare compliance regulations (DPDP Act 2023 / HIPAA guidance).
  - Audit metadata is strictly scrubbed of patient health values (no diagnoses or dosages) and passwords before persistence.
