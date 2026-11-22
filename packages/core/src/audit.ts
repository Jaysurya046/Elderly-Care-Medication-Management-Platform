import { createHash } from 'node:crypto';

export type AuditAction =
  | 'AUTH:LOGIN'
  | 'AUTH:LOGOUT'
  | 'AUTH:PASSCODE_VERIFIED'
  | 'AUTH:PASSCODE_LOCKED'
  | 'PROFILE:VIEW'
  | 'PROFILE:UPDATE'
  | 'PROFILE:DELETE_REQUESTED'
  | 'HEALTH_DATA:READ'
  | 'MEDICATION:CREATE'
  | 'MEDICATION:UPDATE'
  | 'MEDICATION:STOCK_ADJUSTMENT'
  | 'MEDICATION:DELETE'
  | 'DOSE:ACTION'
  | 'DOSE:ACTION_DENIED'
  | 'DOSE:CORRECTION'
  | 'CARE_NOTE:CREATE'
  | 'CARE_NOTE:UPDATE'
  | 'CARE_NOTE:DELETE'
  | 'APPOINTMENT:CREATE'
  | 'APPOINTMENT:UPDATE'
  | 'APPOINTMENT:DELETE'
  | 'CARE_CIRCLE:INVITE'
  | 'CARE_CIRCLE:ACCEPT'
  | 'CARE_CIRCLE:CONFIRM_MEMBERSHIP'
  | 'CARE_CIRCLE:REVOKE'
  | 'CARE_CIRCLE:UPDATE_SCOPES'
  | 'EMERGENCY_CARD:VIEW'
  | 'DATA:EXPORT'
  | 'DATA:DELETE';

/**
 * Truncates / hashes client IP to comply with data minimization and GDPR/DPDP rules.
 */
export function sanitizeIpAddress(ip?: string | null): string {
  if (!ip) return 'unknown';
  // If localhost
  if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
    return '127.0.0.1';
  }
  // Hash remote IP with sha256 to anonymize
  return createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

/**
 * Sanitizes audit metadata, strictly stripping passwords, passcodes, tokens,
 * and specific medical health data values (e.g. dosages, diagnoses, test results).
 */
export function sanitizeAuditMetadata(
  meta: Record<string, unknown> | null | undefined
): Record<string, unknown> {
  if (!meta) return {};

  const forbiddenKeys = [
    'password',
    'passwordHash',
    'passcode',
    'passcodeHash',
    'token',
    'tokenHash',
    'totpSecret',
    'bloodType',
    'allergies',
    'conditions',
    'dosage',
    'strength',
    'instructions',
  ];

  const clean: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(meta)) {
    if (forbiddenKeys.includes(key)) {
      continue;
    }
    // Deep sanitize if nested object
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      clean[key] = sanitizeAuditMetadata(val as Record<string, unknown>);
    } else {
      clean[key] = val;
    }
  }

  return clean;
}
