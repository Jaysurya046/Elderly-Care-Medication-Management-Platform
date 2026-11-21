import { hash, verify } from '@node-rs/argon2';
import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'node:crypto';
import * as OTPAuth from 'otpauth';

// 1. Password and Passcode Hashing with Argon2id
export async function hashSecret(secret: string): Promise<string> {
  return hash(secret, {
    memoryCost: 19456, // 19 MB
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifySecret(hashString: string, candidate: string): Promise<boolean> {
  try {
    return await verify(hashString, candidate);
  } catch {
    return false;
  }
}

// 2. Encryption at rest for TOTP secrets (AES-256-GCM)
export function validateEncryptionKey(customKey?: string): Buffer {
  const hexKey = customKey ?? process.env.APP_ENCRYPTION_KEY;
  if (!hexKey) {
    throw new Error('APP_ENCRYPTION_KEY environment variable is required and cannot be empty.');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
    throw new Error('APP_ENCRYPTION_KEY must be exactly 32 bytes of hex (64 hex characters).');
  }
  return Buffer.from(hexKey, 'hex');
}

// Enforce key validation at runtime in production (excluding static next build page collection)
if (
  process.env.NODE_ENV === 'production' &&
  process.env.NEXT_PHASE !== 'phase-production-build' &&
  process.env.APP_ENCRYPTION_KEY
) {
  validateEncryptionKey();
}

function getEncryptionKey(): Buffer {
  return validateEncryptionKey();
}

export function encryptString(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptString(ciphertext: string): string {
  const [ivHex, authTagHex, encrypted] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encrypted) {
    throw new Error('Invalid encrypted string format.');
  }
  const decipher = createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(ivHex, 'hex')
  );
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// 3. Random token generator & sha256 hash for single-use invitations & emergency codes
export function generateRandomToken(bytes: number = 32): string {
  return randomBytes(bytes).toString('hex');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateEmergencyCode(): string {
  // 8 uppercase alphanumeric characters, easy to read and type
  const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // exclude confusing chars like 0, O, 1, I
  let code = '';
  const bytes = randomBytes(8);
  for (let i = 0; i < 8; i++) {
    code += chars[bytes[i] % chars.length];
  }
  return code;
}

// 4. TOTP Generation & Verification
export function generateTotpSecret(userEmail: string): { secret: string; uri: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'Elder Care Platform',
    label: userEmail,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret({ size: 20 }),
  });

  return {
    secret: totp.secret.base32,
    uri: totp.toString(),
  };
}

export function verifyTotpCode(secretBase32: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    issuer: 'Elder Care Platform',
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secretBase32),
  });

  const delta = totp.validate({ token, window: 1 });
  return delta !== null;
}
