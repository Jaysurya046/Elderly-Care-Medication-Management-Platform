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
