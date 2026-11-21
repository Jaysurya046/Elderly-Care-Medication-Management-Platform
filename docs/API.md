# API Reference: Elder Care Platform

All API routes under `/api/profiles/[id]` are strictly gated by `requireProfileAccess(profileId, { role?, scope? })`. Unauthorized requests return typed HTTP status codes (`401 Unauthorized` or `403 Forbidden`) and record an immutable event in `AuditLog`.

---

## Endpoints Summary

### 1. Care Profile

#### `GET /api/profiles/:id`
Returns profile details, current user role, and active scope grants.
- **Access**: Active membership (`OWNER`, `CAREGIVER`, or `FAMILY`).
- **Response**:
  ```json
  {
    "success": true,
    "data": {
      "profile": {
        "id": "uuid",
        "displayName": "Kamala Devi",
        "dateOfBirth": "1952-04-14",
        "timezone": "Asia/Kolkata",
        "bloodType": "O+",
        "allergies": "Penicillin, Sulfa drugs"
      },
      "userRole": "CAREGIVER",
      "scopes": { "view_medications": true, "manage_medications": true }
    }
  }
  ```
  *(Note: `emergencyCode` is sensitive and returned strictly when `userRole` is `OWNER`; omitted for all other roles).*

#### `PATCH /api/profiles/:id`
Updates care profile details.
- **Access**: `OWNER` role only.

---

### 2. Medications & Doses

#### `GET /api/profiles/:id/medications`
Returns all active medications and their schedules.
- **Access**: Scope `view_medications`.

#### `POST /api/profiles/:id/medications`
Creates a new medication, schedule, and generates initial 14 days of doses.
- **Access**: Scope `manage_medications`.

#### `POST /api/profiles/:id/doses/:doseId/action`
Records a state change on a specific dose event (`TAKE`, `SNOOZE`, `SKIP`, `CORRECTION`).
- **Access**: Scope `view_medications` (for taking) or `manage_medications` (for corrections).
- **Request Body**:
  ```json
  {
    "action": "TAKE",
    "note": "Taken after breakfast"
  }
  ```

---

### 3. Data Privacy, Export & Erasure

#### `GET /api/profiles/:id/export`
Generates a downloadable JSON bundle of all profile records, active medications, dose history, and care notes.
- **Access**: `OWNER` role only.
- **Audited**: Yes (`DATA:EXPORT`).

#### `POST /api/profiles/:id/delete`
Schedules care profile deletion with an immutable 30-day grace period.
- **Access**: `OWNER` role only.
- **Audited**: Yes (`PROFILE:DELETE_REQUESTED`).
