# Architecture & Design Decisions

This document records architectural, technical, and domain decisions made throughout the lifecycle of the Elder Care & Medication Management Platform, in compliance with Section 0 and Section 10 of `Goal.md`.

---

## Decision Log

### DEC-001: Monorepo Layout with pnpm Workspaces
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: The platform consists of a web app (`apps/web`), background worker (`apps/worker`), Prisma DB package (`packages/db`), pure domain logic (`packages/core`), shared UI primitives (`packages/ui`), and email templates (`packages/email`).
- **Decision**: Use `pnpm` workspaces for dependency isolation, fast installation, and strict package boundary enforcement. Keep domain logic pure with zero external I/O dependencies in `packages/core`.
- **Rationale**: Direct compliance with `Goal.md` section 3 and section 12.

### DEC-002: Next.js 15 App Router & Server Actions
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: The web application requires robust server-side authentication, high accessibility, PWA capabilities, and responsive UI for both Senior Mode and Care Circle Mode.
- **Decision**: Next.js 15 App Router with TypeScript (strict mode), Server Actions for mutating operations, and typed Route Handlers for API endpoints.
- **Rationale**: Matches specification in Section 3; enables fine-grained authorization via `requireProfileAccess` on every action and route.

### DEC-003: Database Engine & Primary Keys
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: High-integrity medical and care data requiring transactional consistency, auditability, and reliable concurrency control.
- **Decision**: PostgreSQL with Prisma ORM. UUID primary keys (v4/gen_random_uuid()) and `timestamptz` for all timestamps stored strictly in UTC.
- **Rationale**: Mandated in Section 3 and Section 5. Prevents ID enumeration attacks and ensures timezone consistency.

### DEC-004: Pure Domain State Machine for Dose Lifecycle
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Dose transitions (`PENDING`, `TAKEN`, `LATE_TAKEN`, `SKIPPED`, `SNOOZED`, `MISSED`) have strict business rules, zero-floor stock decrements, and must prevent concurrent double-takes.
- **Decision**: Isolate the entire dose lifecycle state machine and validation in `packages/core`. Database updates use atomic conditional updates (`WHERE id = ? AND status = 'PENDING' AND stockCount > 0`) to prevent race conditions.
- **Rationale**: Mandated by Section 6.1 and Section 9.

### DEC-005: Timezone Handling & Quiet Hours
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Elders and caregivers may live in different time zones, but medication schedules belong strictly to the elder.
- **Decision**: Default new profiles to `Asia/Kolkata`. Store all instants in UTC in PostgreSQL. Expand schedules and calculate quiet hours (`22:00` to `06:30` by default) using the profile's IANA timezone via `date-fns-tz`. Critical medications bypass quiet hours; non-critical reminders defer to `06:30`.
- **Rationale**: Mandated by Section 1 (Principle 7) and Section 6.3.

### DEC-006: Safe Emails by Default
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Privacy of health information in notifications.
- **Decision**: By default, reminder emails never include medication names or diagnoses ("You have medicines due at 8:00 AM. Open the app to see them."). Only if the elder explicitly toggles `emailShowsMedicineNames = true` on their profile will medication names be included in email notifications.
- **Rationale**: Mandated by Section 1 (Principle 5) and Section 6.3.

### DEC-007: Append-Only Auditing and Zero Password Leakage
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Regulatory and privacy compliance for sensitive health information.
- **Decision**: `AuditLog` table is append-only. No application queries may delete or alter audit logs. Sensitive actions (profile access, health data reads, dose records, appointment changes, emergency views, exports) create audit logs with hashed IP and actor metadata. Never include passwords, passcodes, or health payload values in audit logs or API responses.
- **Rationale**: Mandated by Section 1 (Principles 2 & 3) and Section 8.

### DEC-008: Custom Database Sessions vs Auth.js v5
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Authentication architecture and immediate session revocation.
- **Decision**: Implemented opaque database sessions stored in PostgreSQL with 32-byte cryptographically secure random session tokens and httpOnly cookies, instead of Auth.js v5.
- **Rationale**: Direct database sessions guarantee instant revocation on the next HTTP request without relying on stateless JWT expiry or complex OAuth adapter synchronization.

### DEC-009: Strict Redis Rate Limiting with Test-Only In-Memory Fallback
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Brute force protection across distributed instances vs isolated unit/integration tests.
- **Decision**: Production rate limiting requires Redis and fails closed (503) if Redis is unreachable; in-memory fallback is strictly restricted to automated unit test environments.
- **Rationale**: Prevents silent degradation of brute force defenses in production multi-container deployments while keeping test runs isolated.

### DEC-010: Worker Bundling via tsup with Inlined Workspace Packages
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Background worker execution in containerized environments.
- **Decision**: Bundle `apps/worker` via `tsup` inlining internal monorepo packages (`@elder-care/core`, `@elder-care/db`, `@elder-care/email`) into `dist/index.js`.
- **Rationale**: Eliminates runtime Node.js ESM module resolution errors (`ERR_MODULE_NOT_FOUND` and `.ts` extension mismatch) in production.

### DEC-011: Prisma Migrations with Drift Detection in CI
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Database schema lifecycle and CI verification.
- **Decision**: Replace `prisma db push` with committed SQL migrations under `packages/db/prisma/migrations/` and enforce a drift check in CI via `prisma migrate diff --exit-code`.
- **Rationale**: Guarantees deterministic, traceable database schema evolution with automated drift prevention.

### DEC-012: Atomic Dose Transitions and Zero-Floor Stock Decrement
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Preventing race conditions between concurrent caregivers recording the same dose and preventing negative inventory.
- **Decision**: Implemented single-transaction conditional update on `DoseEvent` matching `{ id, status: previousStatus, stockDecremented: false }`, raising `ConflictError` with the other caregiver's name on mismatch. Decrement medication inventory atomically via `{ stockCount: { decrement: 1 } }` with a zero floor (`{ stockCount: { gt: 0 } }`), recording `stockDecremented: true` only if the dose update succeeded.
- **Rationale**: Guarantees that concurrent dose recordings cannot both succeed and medication stock cannot drop below zero or decrement twice.

### DEC-013: Secrets Scrubbing, Emergency Code Role Scoping, and Passcode Session Binding
- **Date**: 2026-11-21
- **Status**: Accepted
- **Context**: Data minimization, emergency code exposure, and credential validation boundaries.
- **Decision**: All Prisma queries including `user` must select strictly `{ id: true, name: true }`, ensuring `passwordHash`, `totpSecret`, and `passcodeHash` are never loaded or returned. `GET /api/profiles/[id]` strips `emergencyCode` for all non-OWNER callers. Removed the hardcoded fallback encryption key in `crypto.ts`, enforcing strict 32-byte hex validation. `verifyMemberPasscode` requires an authenticated session matching `membership.userId === user.id` with ACTIVE status, backed by Redis rate-limiting (5 attempts per 15 mins).
- **Rationale**: Meets strict privacy, healthcare compliance, and anti-tamper requirements specified in Goal.md.

### DEC-014: Invitations Atomicity, Fail-Closed Rate Limiting, CSRF, Audit Immutability, and AST Route Guards (Phase 1c)
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: Authorization bypass prevention, brute-force mitigation, cross-site forgery defense, and database-level audit immutability.
- **Decision**: 
  1. Care Circle invitations reject `role: OWNER`. Acceptance is executed atomically via `invitation.updateMany({ where: { id, usedAt: null } })`. Membership remains in `INVITED` status until confirmed by an OWNER/elder via `confirmCareCircleMember`, triggering `CARE_CIRCLE:CONFIRM_MEMBERSHIP` audit log and sending notification email.
  2. Rate limiting fails closed in production with a 503 error if Redis is unreachable; in-memory fallback is strictly restricted to test/development environments.
  3. Enforced strict security headers (CSP, HSTS, X-Content-Type-Options: nosniff, X-Frame-Options: DENY, Referrer-Policy) and CSRF protection on all state-changing HTTP requests (`POST`, `PUT`, `PATCH`, `DELETE`) with origin/host verification.
  4. Shared Zod schemas in `@elder-care/core` validate all API inputs with 400 field-level plain errors. Generic 500 error handler with Pino logging masks internal errors and returns opaque `requestId`.
  5. Audit log immutability enforced at the database level via Postgres triggers rejecting `UPDATE` and `DELETE` on `"audit_logs"`, and revoking table mutation privileges from PUBLIC. Audit logs record client IP (via `x-forwarded-for`/`x-real-ip`) and user agent, auditing successful reads of health data.
  6. Route guard verification strengthened using TypeScript AST traversal to verify that every exported HTTP method directly invokes `requireProfileAccess`.
- **Rationale**: Direct compliance with Phase 1c security mandates and Section 4/8/9 of Goal.md.

### DEC-015: Real Authentication, Password Reset, Session Revocation, and Edge Middleware (Phase 2)
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: User onboarding, authentication lifecycle, 2FA/TOTP verification, cross-device session revocation, password reset security, and route protection.
- **Decision**:
  1. Dedicated sign-up flow (`POST /api/auth/signup`) records consent version (`v1.0`) and timestamp in the user record, hashes passwords via Argon2id, creates an initial user profile, and establishes an authenticated session.
  2. Sign-in (`POST /api/auth/signin`) supports step-up 2FA (TOTP) when enabled, verifying TOTP tokens against decrypted AES-256-GCM secrets with a drift window.
  3. Password reset uses 32-byte cryptographically secure random tokens stored strictly as SHA-256 hashes (`PasswordResetToken` table) with 1-hour expiration and Redis rate limiting (3 requests per 15 mins). Confirming a password reset resets the password and atomically invalidates all active sessions for that user across all devices.
  4. Passcode management allows setting 4-6 digit numeric PINs (Argon2id hashed) and verification bound to the authenticated user's session.
  5. Session management (`/api/auth/sessions`) lists all active sessions and allows revocation of specific sessions or all other sessions. Session cookies are configured with `httpOnly: true`, `SameSite: 'lax'`, and `secure: true` in production.
  6. Next.js Edge Middleware (`apps/web/src/middleware.ts`) protects routes (`/senior`, `/dashboard`, `/profiles/*`), redirecting unauthenticated users to `/login` while explicitly exempting emergency paths (`/emergency`, `/profiles/[id]/emergency`).
  7. Seed script (`packages/db/prisma/seed.ts`) guarded with `guardSeedExecution()`, failing immediately if executed under `NODE_ENV === 'production'`.
- **Rationale**: Meets all Phase 2 requirements for robust, auditable user authentication and immediate session invalidation without token drift.

### DEC-016: Complete API Surface and AST Security Enforcement (Phase 3)
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: Completing all core REST API endpoints required by Goal.md with input validation, CSRF verification, audit logging, and AST route-guard compliance.
- **Decision**:
  1. Care Circle Invitation (`POST /api/profiles/[id]/care-circle/invite`): Rejects OWNER role invitations, generates 7-day token, sends invitation email, returns 201 Created.
  2. Care Circle Member Confirmation (`POST /api/profiles/[id]/care-circle/confirm`): OWNER-only confirmation of pending members and scopes, audits `CARE_CIRCLE:CONFIRM_MEMBERSHIP`.
  3. Care Circle Member Removal (`DELETE /api/profiles/[id]/care-circle/[memberId]`): OWNER-only, enforces business rule rejecting removal of the last active OWNER with error, returns 204 No Content.
  4. Medication Management (`PATCH /api/profiles/[id]/medications/[medId]`, `DELETE /api/profiles/[id]/medications/[medId]`): Supports updating medication metadata, stock adjustments (audited with `MEDICATION:STOCK_ADJUSTMENT`), and soft delete via `isActive: false` (audited with `MEDICATION:DELETE`).
  5. Appointments (`POST /api/profiles/[id]/appointments`, `GET /api/profiles/[id]/appointments`): Filterable by date range, strictly hides private appointments from users lacking `view_private_items`, returns 201/200.
  6. Care Notes (`POST /api/profiles/[id]/care-notes`, `GET /api/profiles/[id]/care-notes`): Privacy-scoped notes, audited as `CARE_NOTE:CREATE` and `HEALTH_DATA:READ`.
  7. Doses Query (`GET /api/profiles/[id]/doses`): Filterable by date range and status, returns full schedule and actor metadata.
  8. Dose Correction (`POST /api/profiles/[id]/doses/[doseId]/correction`): Allows OWNER/CAREGIVER to correct recorded doses with mandatory reason, audited as `DOSE:CORRECTION`.
  9. Activity Feed (`GET /api/profiles/[id]/activity`): Unified chronological stream aggregating dose events, care notes, and appointments, respecting privacy visibility.
  10. Every exported HTTP method across all routes directly invokes `requireProfileAccess`, verified by TypeScript AST static analysis.
- **Rationale**: Full compliance with Section 4, 6, 8, 9, and Phase 3 API specifications.

### DEC-017: Background Worker Architecture, Jobs & Graceful Shutdown (Phase 4)
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: Reliable, scheduled, and idempotent background processing for medication dose generation, dose reminders, escalation, auto-miss transitions, stock alerts, appointment reminders, and GDPR/health data scheduled deletions.
- **Decision**:
  1. Built background worker service powered by BullMQ and Redis connection pool (`apps/worker`), packaged cleanly via `tsup` targeting Node 22 ESM (`dist/index.js`).
  2. Implemented 5 key asynchronous job processors:
     - `dose-generation`: Generates daily scheduled doses idempotently using composite keys (`profileId:medicationId:date`).
     - `dose-reminders`: Evaluates quiet hours, notification channels (email/push/SMS), and escalates missed doses to primary caregivers.
     - `auto-miss`: Bounded batch scanner (`take: 100`) executing atomic conditional state transitions (`updateMany({ where: { status: { in: ['PENDING', 'SNOOZED'] } } })`) to mark expired doses as `MISSED` with explicit `DoseEventAction` tracking.
     - `appointment-reminders`: Evaluates multi-window reminder offsets (7 days, 24 hours, 2 hours), tracks deduplicated alerts via `referenceKey`, and dispatches emails respecting privacy settings.
     - `scheduled-deletion`: Enforces data lifecycle deletion for profiles where `deletionRequestedAt <= now - 30 days`, cascades profile deletion, and records `DATA:DELETE` audit event.
  3. Worker registers repeat cron schedules and implements robust graceful shutdown on `SIGTERM` and `SIGINT`, awaiting job completion via `worker.close()` and closing the Redis connection cleanly before exiting.
- **Rationale**: Fulfills Phase 4 mandates and Sections 5, 8, 10, and 13 of Goal.md.

### DEC-018: Interactive Web UI Wiring, Offline Queue, and Passcode Exit Gate (Phase 5)
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: Replacing static mockups with real data-bound interactions in Senior Mode and the Caregiver Dashboard.
- **Decision**:
  1. Senior Mode (`apps/web/src/app/senior/page.tsx`):
     - Fetches active profile and doses for today from real endpoints (`/api/auth/me` and `/api/profiles/[id]/doses`).
     - Implements 3-tap action: `TAKE` (decrements stock, transitions to TAKEN), `SNOOZE` (increments snooze count), and `SKIP` (prompts mandatory reason, transitions to SKIPPED).
     - Protects exit to Caregiver Dashboard via Passcode verification modal against `POST /api/auth/passcode`.
     - Detects offline connectivity (`navigator.onLine`), presents prominent warning banner, saves pending actions to local queue, and automatically synchronizes when connection returns.
     - Live screen reader updates announced via `aria-live="polite"` and `aria-live="assertive"`.
  2. Caregiver Dashboard (`apps/web/src/app/dashboard/page.tsx`):
     - Displays real adherence score using `@elder-care/core` calculation (`calculateAdherence`).
     - Detects low stock items with visual warning banner and "View Stock" shortcut.
     - Fully wired modal forms for adding medications, updating stock count, scheduling appointments, writing care notes, inviting caregivers, and confirming pending members.
     - Enforces emergency code privacy: displayed strictly for role OWNER; masked with a security note for other roles.
- **Rationale**: Eliminates all UI stubs and delivers fully interactive, accessible, and resilient client interfaces adhering to Section 7 & 13 of Goal.md.

### DEC-019: Data Lifecycle: JSON/CSV Export, 30-Day Grace Deletion, and Worker Purge (Phase 6)
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: GDPR and Indian DPDP 2023 compliance for complete personal data export and self-service account deletion with grace periods.
- **Decision**:
  1. Complete export endpoint (`GET /api/profiles/[id]/export`) supporting both JSON and CSV formats via `?format=csv|json`. Requires `manage_medications` scope or role `OWNER`. Audited as `DATA:EXPORT`. Strips passwords, passcodes, and secrets.
  2. Scheduled deletion flow (`POST /api/profiles/[id]/delete`) sets a 30-day grace period timestamp (`deletionRequestedAt`), audited as `PROFILE:DELETE_REQUESTED`.
  3. Deletion cancellation (`DELETE /api/profiles/[id]/delete`) allows the OWNER to reverse scheduled deletion at any time during the 30-day grace period, clearing `deletionRequestedAt`.
  4. Background worker job (`scheduled-deletion.job.ts`) continuously purges profiles whose grace period has expired, writing a final `DATA:DELETE` audit event before permanent cascade delete.
- **Rationale**: Guarantees full data sovereignty, data portability, and right-to-be-forgotten compliance without accidental data loss.

### DEC-020: Playwright E2E Axe Testing and Real Database CI Environment (Phase 7)
- **Date**: 2026-11-22
- **Status**: Accepted
- **Context**: End-to-end verification, WCAG 2.2 AA accessibility compliance, and real database concurrency testing.
- **Decision**:
  1. Playwright test suite (`apps/web/e2e/accessibility.spec.ts`) runs automated axe accessibility audits against `/senior`, `/dashboard`, and `/login`, asserting 0 serious or critical accessibility violations across WCAG 2.1 and WCAG 2.2 AA rules.
  2. Real database and Redis service containers are run in GitHub Actions CI workflow, executing real concurrency assertions, auth lifecycle, and database migrations.
  3. Local test environment without Docker gracefully skips live DB concurrency tests while keeping unit and mock verification strictly green.
- **Rationale**: Adheres to the core ground rule: "Evidence over claims". Every test and status entry reflects real executed commands.


