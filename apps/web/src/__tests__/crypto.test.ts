import { describe, it, expect } from 'vitest';
import {
  hashSecret,
  verifySecret,
  encryptString,
  decryptString,
  generateEmergencyCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../lib/crypto';

describe('Cryptographic Infrastructure (apps/web)', () => {
  it('hashes secrets with Argon2id and verifies valid and invalid candidates', async () => {
    const rawSecret = 'SecureElderP@ss2026';
    const hash = await hashSecret(rawSecret);

    expect(hash).toContain('$argon2id$');
    expect(await verifySecret(hash, rawSecret)).toBe(true);
    expect(await verifySecret(hash, 'WrongPassword')).toBe(false);
  });

  it('encrypts and decrypts strings at rest using AES-256-GCM', () => {
    const sensitiveSecret = 'JBSWY3DPEHPK3PXP'; // e.g. TOTP base32 secret
    const encrypted = encryptString(sensitiveSecret);

    expect(encrypted).not.toBe(sensitiveSecret);
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3); // iv : authTag : ciphertext

    const decrypted = decryptString(encrypted);
    expect(decrypted).toBe(sensitiveSecret);
  });

  it('fails decryption cleanly on corrupted ciphertext or auth tag', () => {
    const sensitive = 'SecretHealthNote';
    const encrypted = encryptString(sensitive);
    const [iv, tag, cipher] = encrypted.split(':');

    // Tamper with ciphertext
    const tamperedCipher = cipher.slice(0, -2) + '00';
    expect(() => decryptString(`${iv}:${tag}:${tamperedCipher}`)).toThrow();
  });

  it('generates compliant 8-character uppercase emergency codes', () => {
    const code = generateEmergencyCode();
    expect(code.length).toBe(8);
    // Excludes ambiguous characters (0, O, 1, I)
    expect(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(code)).toBe(true);
  });

  it('generates and validates TOTP codes with a 1-step window', () => {
    const { secret } = generateTotpSecret('kamala@eldercare.demo');
    expect(secret.length).toBeGreaterThan(10);

    // Using OTPAuth to generate current code
    const OTPAuth = require('otpauth');
    const totp = new OTPAuth.TOTP({
      issuer: 'Elder Care Platform',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: OTPAuth.Secret.fromBase32(secret),
    });

    const currentToken = totp.generate();
    expect(verifyTotpCode(secret, currentToken)).toBe(true);
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });
});
