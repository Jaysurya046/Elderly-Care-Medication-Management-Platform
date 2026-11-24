import Redis from 'ioredis';
import { ServiceUnavailableError } from '@elder-care/core';

let redisClient: Redis | null = null;
const memoryStore = new Map<string, { count: number; expiresAt: number }>();

/**
 * Atomic Lua script to execute INCR and EXPIRE atomically in a single round-trip.
 * Guarantees that no key is ever created without a TTL even if the client disconnects immediately.
 */
const ATOMIC_INCR_EXPIRE_LUA = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('TTL', KEYS[1])
return {current, ttl}
`;

/**
 * Connects eagerly or awaits connection to Redis when REDIS_URL is provided.
 */
export async function getConnectedRedisClient(): Promise<Redis | null> {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) return null;

  if (!redisClient) {
    try {
      redisClient = new Redis(redisUrl, {
        maxRetriesPerRequest: 1,
        lazyConnect: true,
        retryStrategy: () => null, // Don't infinite retry if Redis is unreachable
      });
      // Suppress unhandled EventEmitter errors on the client
      redisClient.on('error', () => {});
    } catch {
      return null;
    }
  }

  if (redisClient.status === 'ready') {
    return redisClient;
  }

  if (redisClient.status === 'wait') {
    try {
      await redisClient.connect();
      return redisClient;
    } catch {
      return null;
    }
  }

  return (redisClient.status as string) === 'ready' ? redisClient : null;
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
  const client = await getConnectedRedisClient();

  if (client && client.status === 'ready') {
    try {
      // Execute atomic Lua script
      const res = (await client.eval(
        ATOMIC_INCR_EXPIRE_LUA,
        1,
        key,
        windowSeconds
      )) as [number, number];

      const current = res[0];
      const ttl = res[1];

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

  // If in production and Redis is not ready/available, FAIL CLOSED (503)
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
  const client = await getConnectedRedisClient();
  if (client && client.status === 'ready') {
    try {
      await client.del(key);
    } catch {
      // ignore
    }
  }
  memoryStore.delete(key);
}
