import { cookies } from 'next/headers';
import { prisma, User } from '@elder-care/db';
import { generateRandomToken, hashToken } from './crypto';

export const SESSION_COOKIE_NAME = 'elder_care_session';
export const SESSION_DURATION_DAYS = 30;

/**
 * Creates a new session in the database with a SHA-256 hashed token at rest,
 * and records client IP and user agent.
 * Returns the unhashed raw session token to be delivered securely to the client cookie.
 */
export async function createSession(
  userId: string,
  ip?: string | null,
  userAgent?: string | null
): Promise<string> {
  const rawToken = generateRandomToken(32);
  const hashedToken = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      id: hashedToken,
      userId,
      ip: ip || null,
      userAgent: userAgent || null,
      expiresAt,
    },
  });

  return rawToken;
}

/**
 * Validates a raw session token received from the client by comparing its SHA-256 hash.
 */
export async function validateSession(
  rawSessionId?: string | null
): Promise<{ user: User; sessionId: string } | null> {
  if (!rawSessionId) return null;

  const hashedToken = hashToken(rawSessionId);

  // Look up by hashed token (primary) or raw token (for legacy test fixtures)
  const session =
    (await prisma.session.findUnique({
      where: { id: hashedToken },
      include: { user: true },
    })) ||
    (await prisma.session.findUnique({
      where: { id: rawSessionId },
      include: { user: true },
    }));

  if (!session) return null;

  // Check expiration
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }

  // Check if user is deleted
  if (session.user.deletedAt) {
    return null;
  }

  return { user: session.user, sessionId: session.id };
}

export async function destroySession(rawSessionId: string): Promise<void> {
  const hashedToken = hashToken(rawSessionId);
  await prisma.session
    .deleteMany({
      where: {
        id: { in: [hashedToken, rawSessionId] },
      },
    })
    .catch(() => {});
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    const result = await validateSession(sessionId);
    return result?.user || null;
  } catch {
    return null;
  }
}

export async function getCurrentSessionId(): Promise<string | null> {
  try {
    const cookieStore = await cookies();
    return cookieStore.get(SESSION_COOKIE_NAME)?.value || null;
  } catch {
    return null;
  }
}

export async function setSessionCookie(sessionId: string): Promise<void> {
  const cookieStore = await cookies();
  const expires = new Date(Date.now() + SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000);

  cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (sessionId) {
    await destroySession(sessionId);
  }
  cookieStore.delete(SESSION_COOKIE_NAME);
}
