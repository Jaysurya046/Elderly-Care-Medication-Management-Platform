# Elder Care & Medication Management Platform

> A production-quality, accessible healthcare platform designed to empower older adults to manage medicines, doctor appointments, and daily routines with dignity, while keeping family and caregivers informed through consent-based access.

---

## 🌟 Core Principles

1. **Elder in Control**: The elder owns their profile, grants access explicitly, can revoke permissions instantly, and can mark appointments/notes as private.
2. **Extreme Accessibility (Senior Mode)**: Tailored for older adults with 18px–28px font scale, high-contrast tokens, minimum 48×48px touch targets, Web Speech API read-aloud support, and WCAG 2.2 AA compliance.
3. **Safe by Default Notifications**: Emails never leak medicine names or health diagnoses unless the elder explicitly enables this per profile.
4. **Append-Only Auditing**: Every access to health data, grant modification, and emergency card view generates an immutable, append-only `AuditLog`.
5. **Deterministic Insights & No Automated Medical Advice**: Zero software-generated dosages or prescriptions. Software provides descriptive insights and strict confirmation gates.

---

## 🏗️ Repository Architecture

This repository is organized as a pnpm monorepo:

```
├── apps/
│   ├── web/          # Next.js 15 App Router (Senior Mode, Care Circle Dashboard, API)
│   └── worker/       # BullMQ async background worker (reminders, escalation, daily generation)
├── packages/
│   ├── core/         # Pure domain logic: state machine, schedule engine, permissions, adherence
│   ├── db/           # Prisma schema, PostgreSQL migrations, demo seed data
│   ├── ui/           # Accessible UI primitives (Radix, Tailwind tokens, Read-Aloud button)
│   └── email/        # React Email templates (digests, safe reminders, critical escalations)
├── docs/
│   ├── PRD.md        # Product requirements, user personas & journeys
│   ├── ARCHITECTURE.md # System diagram, module boundaries & failure modes
│   ├── DECISIONS.md   # Architectural decision records (ADRs)
│   ├── THREAT_MODEL.md
│   ├── ACCESSIBILITY.md
│   ├── API.md
│   └── RUNBOOK.md
├── docker-compose.yml # PostgreSQL 16, Redis 7, Mailpit (SMTP & Web UI)
└── package.json
```

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js**: `v20.x` or `v22.x`
- **pnpm**: `v10+` or `v12+`
- **Docker & Docker Compose** (for local Postgres, Redis, and Mailpit)

### 2. Environment Setup
Copy the environment template:
```bash
cp .env.example .env
```

### 3. Start Local Infrastructure
Launch PostgreSQL, Redis, and Mailpit:
```bash
docker compose up -d
```
- **PostgreSQL**: `localhost:5432` (User: `postgres`, Password: `postgres`, DB: `elder_care`)
- **Redis**: `localhost:6379`
- **Mailpit Web UI**: `http://localhost:8025` (SMTP: `localhost:1025`)

### 4. Install Dependencies & Generate Prisma Client
```bash
pnpm install
pnpm db:generate
```

### 5. Run Migrations & Seed Demo Data
```bash
pnpm db:migrate
pnpm db:seed
```

### 6. Start Development Servers
```bash
# Start Next.js web application (http://localhost:3000)
pnpm dev

# Start BullMQ background worker (in separate terminal)
pnpm dev:worker
```

---

## 👥 Demo Accounts (Pre-Seeded)

The database seed provides two pre-configured profiles with medications, appointments, and care circle members:

### Profile 1: Smt. Kamala Devi (Pune, India - `Asia/Kolkata`)
- **Elder / Owner**: `kamala@eldercare.demo` (Password: `Password123!`, PIN: `1234`)
  - *Emergency Access Code*: `EMRG8821`
  - *Medications*: Metformin 500mg, Telmisartan 40mg (CRITICAL), Shelcal 500
- **Caregiver**: `rajesh@eldercare.demo` (Password: `Password123!`, PIN: `5678`)
  - *Permissions*: Can manage medications and appointments, receives missed-dose alerts.

### Profile 2: Col. Ashok Verma (Retd.) (New Delhi, India - `Asia/Kolkata`)
- **Elder / Owner**: `ashok@eldercare.demo` (Password: `Password123!`, PIN: `1234`)
  - *Emergency Access Code*: `EMRG9912`
  - *Medications*: Clopidogrel 75mg (CRITICAL), Atorvastatin 20mg
- **Caregiver**: `anita@eldercare.demo` (Password: `Password123!`, PIN: `5678`)

---

## 🧪 Testing & Validation

```bash
# Run pure domain unit tests (Vitest)
pnpm test

# Run TypeScript type-checking across all packages
pnpm type-check

# Run linter
pnpm lint
```

---

## 🔒 Security & Privacy Features

- **Argon2id**: High-memory hashing for user passwords and shared tablet passcodes.
- **Stateless JWTs Prohibited**: Uses server-side session records in PostgreSQL with opaque httpOnly cookies for immediate revocation.
- **Audit Logging**: All reads and writes to sensitive health data create immutable audit logs with sanitized metadata (no health payloads or credentials).
- **Rate Limiting**: Redis-backed brute force protection on login and passcode verification endpoints.

---

## 📄 License

This project is licensed under the [MIT License](file:///c:/Users/jayas/OneDrive/Desktop/web_development/Elderly%20Care%20&%20Medication%20Management%20Platform/LICENSE).

