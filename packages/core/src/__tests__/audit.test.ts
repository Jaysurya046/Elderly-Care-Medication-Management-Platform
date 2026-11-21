import { describe, it, expect } from 'vitest';
import { sanitizeIpAddress, sanitizeAuditMetadata } from '../audit';

describe('Audit Security & Privacy (packages/core)', () => {
  it('hashes external IP addresses to 16-character hex and preserves localhost', () => {
    expect(sanitizeIpAddress('127.0.0.1')).toBe('127.0.0.1');
    expect(sanitizeIpAddress('::1')).toBe('127.0.0.1');
    expect(sanitizeIpAddress(null)).toBe('unknown');

    const hashedIp = sanitizeIpAddress('198.51.100.42');
    expect(hashedIp).not.toBe('198.51.100.42');
    expect(hashedIp.length).toBe(16);
  });

  it('strictly strips sensitive health values, passwords, passcodes, and tokens from audit metadata', () => {
    const rawMetadata = {
      action: 'UPDATE_PROFILE',
      profileId: 'prof-123',
      // Forbidden fields:
      password: 'PlainSecretPassword123!',
      passwordHash: '$argon2id$v=19$m=65536...',
      passcode: '1234',
      passcodeHash: '$argon2id$v=19...',
      token: 'jwt-token-sample',
      totpSecret: 'JBSWY3DPEHPK3PXP',
      bloodType: 'O+',
      allergies: 'Penicillin, Aspirin',
      conditions: 'Hypertension, Diabetes',
      dosage: '500mg twice daily',
      instructions: 'Take after meals',
      // Safe fields:
      changedField: 'displayName',
      timestamp: '2026-11-21T10:00:00Z',
      nested: {
        safeField: 'active',
        password: 'nested-leak',
      },
    };

    const sanitized = sanitizeAuditMetadata(rawMetadata);

    expect(sanitized.action).toBe('UPDATE_PROFILE');
    expect(sanitized.profileId).toBe('prof-123');
    expect(sanitized.changedField).toBe('displayName');
    expect((sanitized.nested as Record<string, unknown>).safeField).toBe('active');

    // Verify all forbidden fields are removed
    expect(sanitized.password).toBeUndefined();
    expect(sanitized.passwordHash).toBeUndefined();
    expect(sanitized.passcode).toBeUndefined();
    expect(sanitized.passcodeHash).toBeUndefined();
    expect(sanitized.token).toBeUndefined();
    expect(sanitized.totpSecret).toBeUndefined();
    expect(sanitized.bloodType).toBeUndefined();
    expect(sanitized.allergies).toBeUndefined();
    expect(sanitized.conditions).toBeUndefined();
    expect(sanitized.dosage).toBeUndefined();
    expect(sanitized.instructions).toBeUndefined();
    expect((sanitized.nested as Record<string, unknown>).password).toBeUndefined();
  });
});
