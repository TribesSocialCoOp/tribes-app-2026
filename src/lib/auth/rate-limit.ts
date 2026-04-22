/**
 * @fileoverview Rate Limiting with Swappable Backend
 * 
 * Ships with InMemoryBackend for single-instance use.
 * Automatically upgrades to ValKeyBackend when VALKEY_URL is set.
 * Valkey is the Redis-compatible, BSD-licensed fork used in our Docker stack.
 * 
 * To activate in production:
 *   Set VALKEY_URL=redis://valkey:6379 in .env.production
 * 
 * The RateLimiter interface stays the same — zero refactoring in action code.
 */
import { logger } from '@/lib/logger';

// ============================================================
// BACKEND INTERFACE
// ============================================================

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp (ms) when the window resets
}

interface RateLimitBackend {
  check(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult>;
}

// ============================================================
// IN-MEMORY BACKEND (single instance, resets on restart)
// ============================================================

interface WindowEntry {
  count: number;
  resetAt: number;
}

class InMemoryBackend implements RateLimitBackend {
  private store = new Map<string, WindowEntry>();
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    // Clean up expired entries every 60 seconds
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.store) {
        if (now > entry.resetAt) {
          this.store.delete(key);
        }
      }
    }, 60_000);

    // Don't prevent process exit
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async check(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = this.store.get(key);

    // No entry or window expired → fresh window
    if (!entry || now > entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
    }

    // Within window
    entry.count++;

    if (entry.count > maxRequests) {
      return { allowed: false, remaining: 0, resetAt: entry.resetAt };
    }

    return { allowed: true, remaining: maxRequests - entry.count, resetAt: entry.resetAt };
  }
}

// ============================================================
// RATE LIMITER (public API)
// ============================================================

class RateLimiter {
  private backend: RateLimitBackend;
  private windowMs: number;
  private maxRequests: number;
  private prefix: string;

  constructor(opts: { prefix: string; windowMs: number; maxRequests: number; backend?: RateLimitBackend }) {
    this.prefix = opts.prefix;
    this.windowMs = opts.windowMs;
    this.maxRequests = opts.maxRequests;
    this.backend = opts.backend ?? defaultBackend;
  }

  /**
   * Check if a request from the given key is allowed.
   * @param key - Unique identifier (userId, IP address, etc.)
   * @throws Error if rate limit exceeded
   */
  async check(key: string): Promise<RateLimitResult> {
    const fullKey = `${this.prefix}:${key}`;
    const result = await this.backend.check(fullKey, this.windowMs, this.maxRequests);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
      throw new Error(
        `Rate limit exceeded. Try again in ${retryAfterSec} seconds.`
      );
    }

    return result;
  }
}

// ============================================================
// VALKEY BACKEND (Redis-protocol, for distributed deployments)
// ============================================================

class ValKeyBackend implements RateLimitBackend {
  private redis: import('ioredis').Redis | null = null;

  private getClient(): import('ioredis').Redis {
    if (!this.redis) {
      // Lazy-load ioredis to avoid import errors in environments without it
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Redis } = require('ioredis');
      this.redis = new Redis(process.env.VALKEY_URL!, {
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        enableReadyCheck: false,
      });
      this.redis!.on('error', (err: Error) => {
        logger.error({ err: err.message, module: 'rate-limit' }, 'Valkey connection error');
      });
    }
    return this.redis!;
  }

  async check(key: string, windowMs: number, maxRequests: number): Promise<RateLimitResult> {
    const client = this.getClient();
    const now = Date.now();
    const resetAt = now + windowMs;

    try {
      // Atomic INCR + EXPIRE using a pipeline
      const pipeline = client.pipeline();
      pipeline.incr(key);
      pipeline.pexpire(key, windowMs);
      const results = await pipeline.exec();

      const count = (results?.[0]?.[1] as number) ?? 1;

      if (count > maxRequests) {
        // Get actual TTL for accurate resetAt
        const ttl = await client.pttl(key);
        return { allowed: false, remaining: 0, resetAt: now + Math.max(ttl, 0) };
      }

      return { allowed: true, remaining: maxRequests - count, resetAt };
    } catch (err) {
      // If Valkey is down, fail open (allow request) to prevent service disruption
      logger.warn({ err: (err as Error).message, module: 'rate-limit' }, 'Valkey error — failing open');
      return { allowed: true, remaining: 1, resetAt };
    }
  }
}

// ============================================================
// SINGLETON BACKEND + PRE-CONFIGURED LIMITERS
// ============================================================

// Auto-detect: use Valkey in production (when VALKEY_URL is set),
// fall back to InMemoryBackend for local dev.
const defaultBackend: RateLimitBackend = process.env.VALKEY_URL
  ? new ValKeyBackend()
  : new InMemoryBackend();

// Auth surfaces — keyed by IP
export const loginLimiter = new RateLimiter({
  prefix: 'login',
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 10,
});

export const signupLimiter = new RateLimiter({
  prefix: 'signup',
  windowMs: 60 * 60 * 1000,  // 1 hour
  maxRequests: 3,
});

// Content surfaces — keyed by userId
export const postLimiter = new RateLimiter({
  prefix: 'post',
  windowMs: 5 * 60 * 1000,   // 5 minutes
  maxRequests: 10,
});

export const commentLimiter = new RateLimiter({
  prefix: 'comment',
  windowMs: 60 * 1000,        // 1 minute
  maxRequests: 15,
});

// Interaction surfaces — keyed by userId
export const rsvpLimiter = new RateLimiter({
  prefix: 'rsvp',
  windowMs: 60 * 1000,        // 1 minute
  maxRequests: 10,
});

export const contributionLimiter = new RateLimiter({
  prefix: 'contribution',
  windowMs: 60 * 60 * 1000,  // 1 hour
  maxRequests: 30,
});

export const bondLimiter = new RateLimiter({
  prefix: 'bond',
  windowMs: 60 * 60 * 1000,  // 1 hour
  maxRequests: 20,
});

// Payment surfaces — keyed by userId
export const checkoutLimiter = new RateLimiter({
  prefix: 'checkout',
  windowMs: 60 * 60 * 1000,  // 1 hour
  maxRequests: 5,
});

export const uploadLimiter = new RateLimiter({
  prefix: 'upload',
  windowMs: 5 * 60 * 1000,   // 5 minutes 
  maxRequests: 20,
});

/**
 * Get client IP from headers. Works with proxied requests.
 */
export function getClientIp(headersList: Headers): string {
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    '127.0.0.1'
  );
}
