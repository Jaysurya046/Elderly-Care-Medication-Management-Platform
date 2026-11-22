import Redis from 'ioredis';

let redisClient: Redis | null = null;
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  try {
    redisClient = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      retryStrategy: () => null, // Don't infinite retry if Redis is down
    });
    redisClient.connect().catch(() => {
      // Redis connection error
      redisClient = null;
    });
    return redisClient;
  } catch {
    return null;
  }
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetSeconds: number;
  error?: string;
}

/**
 * Checks rate limit for a specific key (e.g. `login:user@example.com` or `passcode:membershipId`).
 * Fails closed in production if Redis is unavailable (503 Service Unavailable).
 * In-memory fallback is restricted strictly to non-production environments (tests/dev).
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number = 5,
  windowSeconds: number = 900 // 15 minutes default
): Promise<RateLimitResult> {
  const isProduction = process.env.NODE_ENV === 'production';
  const client = getRedisClient();

  if (client && client.status === 'ready') {
    try {
      const current = await client.incr(key);
      if (current === 1) {
        await client.expire(key, windowSeconds);
      }
      const ttl = await client.ttl(key);

      return {
        success: current <= maxAttempts,
        remaining: Math.max(0, maxAttempts - current),
        resetSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    } catch {
      if (isProduction) {
        return {
          success: false,
          remaining: 0,
          resetSeconds: windowSeconds,
          error: 'Rate limiting service temporarily unavailable. Please try again later.',
        };
      }
    }
  }

  // If in production and Redis is not ready/available, FAIL CLOSED
  if (isProduction) {
    return {
      success: false,
      remaining: 0,
      resetSeconds: windowSeconds,
      error: 'Rate limiting service temporarily unavailable. Please try again later.',
    };
  }

  // In-memory fallback for development and testing ONLY
  const now = Date.now();
  const entry = memoryStore.get(key);

  if (!entry || entry.expiresAt <= now) {
    memoryStore.set(key, { count: 1, expiresAt: now + windowSeconds * 1000 });
    return {
      success: true,
      remaining: maxAttempts - 1,
      resetSeconds: windowSeconds,
    };
  }

  entry.count += 1;
  const remaining = Math.max(0, maxAttempts - entry.count);
  const resetSeconds = Math.ceil((entry.expiresAt - now) / 1000);

  return {
    success: entry.count <= maxAttempts,
    remaining,
    resetSeconds,
  };
}

/**
 * Resets rate limit for a key (e.g. on successful login or verification).
 */
export async function resetRateLimit(key: string): Promise<void> {
  const client = getRedisClient();
  if (client && client.status === 'ready') {
    try {
      await client.del(key);
    } catch {
      // ignore
    }
  }
  memoryStore.delete(key);
}
