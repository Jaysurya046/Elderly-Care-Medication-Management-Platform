# Product Requirements Document (PRD): Elder Care & Medication Management Platform

## 1. Product Overview & Vision
The Elder Care & Medication Management Platform is a production-quality, accessible healthcare application designed specifically for older adults and their designated care circle (family members, professional caregivers, and emergency contacts). 

Unlike conventional health apps designed for tech-savvy younger users, this platform prioritizes:
1. **Elder Autonomy**: The elder owns their profile and retains absolute authority over who can view or manage their health data.
2. **Extreme Accessibility (Senior Mode)**: A high-contrast, uncluttered interface with 18px–28px typography, 48px+ touch targets, simple plain-language instructions, and Web Speech API read-aloud capabilities.
3. **Care Circle Coordination**: Multi-tier consent-based access granting caregivers and family real-time visibility into adherence, appointments, and missed-dose escalations without taking away the elder's independence.
4. **Safety & Privacy First**: Zero unsolicited health data leakage in emails, append-only audit trails, and strict rate-limited passcode authentication.

---

## 2. Target Personas

### Persona A: Smt. Kamala Devi (Elder / Profile Owner)
- **Age**: 74, lives in Pune, India.
- **Health Profile**: Manages Type 2 Diabetes, Hypertension, and Osteoarthritis. Takes 5 medications across morning, afternoon, and night.
- **Tech Comfort**: Uses WhatsApp with large text on a tablet; finds complex menus, tiny buttons, and nested modals overwhelming.
- **Key Needs**:
  - Wants to glance at a single screen and know exactly what medicine to take right now.
  - Wants a simple "I took this" button that doesn't ask 10 follow-up questions.
  - Wants read-aloud support when her eyes are tired in the evening.
  - Needs a printed Emergency Card with blood type, doctor's contact, and allergies to keep in her purse.

### Persona B: Rajesh Sharma (Adult Child & Primary Caregiver)
- **Age**: 48, works in Bengaluru, lives apart from his mother Kamala.
- **Tech Comfort**: High. Uses desktop and smartphone.
- **Key Needs**:
  - Wants peace of mind that his mother took her critical morning insulin/blood pressure pills.
  - Needs immediate email alerts if a critical dose remains missed 60 minutes after grace period.
  - Manages refill thresholds and appointment schedules with Dr. Kulkarni.
  - Needs to respect Kamala's privacy: Kamala may have private medical notes that Rajesh should not see unless explicitly authorized.

### Persona C: Sunita (Visiting Nurse / Caregiver)
- **Age**: 32, visits Kamala 3 days a week.
- **Tech Comfort**: Moderate.
- **Key Needs**:
  - Needs quick 4-digit passcode unlock on the shared kitchen tablet to verify medicines given during the shift.
  - Logs observations in care notes without having full ownership of Kamala's account.

---

## 3. Core User Journeys

### Journey 1: Elder Morning Dose Verification (Senior Mode)
1. Kamala opens the kitchen tablet (or home screen PWA).
2. The screen immediately displays the **Today Timeline** centered on the **Morning Block**.
3. The next pending dose (e.g. *Metformin 500mg - With breakfast*) is prominently highlighted with an audio listen button.
4. She taps **"I took this"** (1 tap).
5. The button transitions to a green checkmark "Taken at 8:15 AM", stock count decrements by 1, and the next afternoon dose moves to the top.

### Journey 2: Caregiver Invitation & Scope Delegation
1. Kamala (or her authorized account owner) navigates to **Care Circle**.
2. Taps **"Invite Member"**, types Rajesh's email, selects role `CAREGIVER`, and configures granular scopes:
   - `view_medications`: YES
   - `manage_medications`: YES
   - `receive_missed_dose_alerts`: YES
   - `view_private_items`: NO (kept private)
3. Rajesh receives an invitation email with a secure, 7-day single-use hashed token.
4. Rajesh signs in with his account and accepts the invitation.
5. Kamala confirms the active membership. Rajesh can now log doses and check inventory from Bengaluru.

### Journey 3: Critical Dose Escalation
1. Kamala's 8:00 AM Blood Pressure dose is scheduled with `criticality: CRITICAL` and `graceMinutes: 60`.
2. At 9:00 AM (8:00 + 60m), the dose is marked `MISSED`. An email reminder is sent to Kamala.
3. At 10:00 AM (MISSED + 60m escalation delay), the dose is still MISSED.
4. The BullMQ background scheduler dispatches an escalation email alert to Rajesh (`receive_missed_dose_alerts = true`).
5. Rajesh calls Kamala, confirms she took it late, and logs a `LATE_TAKEN` action with a note "Taken after phone check-in".

### Journey 4: Emergency Access
1. First responders or an emergency clinic scan/type the 8-character Emergency Code printed on Kamala's emergency card.
2. The endpoint `/profiles/[id]/emergency` opens without requiring a full login session.
3. Displays large-format vital data: Blood Group (O+), Allergies (Penicillin, Sulfa drugs), Conditions, Active Medications, Primary Doctor, Emergency Contacts, and Preferred Hospital.
4. Viewing the card immediately logs an immutable record in `AuditLog`.

---

## 4. MVP Scope Matrix

| Feature Module | In Scope (MVP) | Out of Scope (Phase 2) |
|---|---|---|
| **Authentication** | Email + Password, Argon2id, Session Cookies in PostgreSQL, optional TOTP 2FA, Member Passcode (4–6 digits), Emergency Code (8 chars) | Social OAuth (Google/Apple), Biometric WebAuthn hardware keys |
| **Care Profile & Circle** | Multi-profile accounts, Roles (`OWNER`, `CAREGIVER`, `FAMILY`, `EMERGENCY_VIEWER`), Scopes, Invitations (7-day token), Instant revocation | Cross-organization health system integration |
| **Medication & Schedules** | Medicine catalog, RRULE schedule expansion, 14-day rolling dose generation, Dose Lifecycle (`PENDING`, `TAKEN`, `LATE_TAKEN`, `SKIPPED`, `SNOOZED`, `MISSED`), Stock counts, Refill alerts | OCR automated prescription extraction, automatic drug-drug interaction AI checkers |
| **Appointments** | Doctor appointments, travel-time buffer, private flag, appointment prep view (checklist & questions) | Automatic calendar sync (Google/Outlook 2-way sync) |
| **Reminders & Escalations** | BullMQ background jobs, quiet hours (22:00-06:30), digest grouping, missed dose escalation, safe emails by default | SMS / WhatsApp notifications, automated telephony calls |
| **Adherence & Insights** | 7-day and 30-day adherence rates, streaks, deterministic insight engine | Predictive AI adherence modeling |
| **UI & Accessibility** | Senior Mode (`/senior`), Care Circle Mode (`/dashboard`), Emergency Card (`/profiles/[id]/emergency`), Web Speech API read aloud, WCAG 2.2 AA compliant tokens | Native mobile apps (React Native / Flutter) |
| **Data Governance** | Full JSON export, Account/Profile deletion with 30-day grace period, Append-only Audit Log | FHIR HL7 export standard |

---

## 5. Non-Functional & Regulatory Requirements
- **WCAG 2.2 Level AA**: Minimum 4.5:1 text contrast (7:1 in high-contrast mode), 48px target sizes, visible keyboard focus rings, `aria-live` error announcements.
- **Timezone Integrity**: Profiles default to `Asia/Kolkata`. All database storage in UTC `timestamptz`. Calculations performed in profile local time.
- **Indian DPDP Act & GDPR Alignment**: Explicit consent capture at onboarding, consent versioning, data minimization, right to erasure with audit retention.
- **Zero AI Hallucination**: AI features are off by default. All OCR/AI text marked with "Not medical advice" and requires manual confirmation.
