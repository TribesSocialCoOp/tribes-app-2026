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
    let finalKey = key;
    if (process.env.NODE_ENV !== 'production') {
      try {
        const { headers } = await import('next/headers');
        const headersList = await headers();
        const testSession = headersList.get('x-e2e-test-session');
        if (testSession) {
          finalKey = `${testSession}:${key}`;
        }
      } catch (e) {
        // next/headers might not be available in non-request/non-next contexts
      }
    }

    const fullKey = `${this.prefix}:${finalKey}`;
    const result = await this.backend.check(fullKey, this.windowMs, this.maxRequests);

    if (!result.allowed) {
      const retryAfterSec = Math.ceil((result.resetAt - Date.now()) / 1000);
      let friendlyTime = `${retryAfterSec} seconds`;
      if (retryAfterSec > 120) {
        friendlyTime = `${Math.ceil(retryAfterSec / 60)} minutes`;
      } else if (retryAfterSec > 60) {
        friendlyTime = '2 minutes';
      }

      if (this.prefix === 'signup') {
        throw new Error(
          `Too many signup attempts. Rate limit exceeded. Try again in ${friendlyTime}.`
        );
      } else {
        throw new Error(
          `Rate limit exceeded. Try again in ${friendlyTime}.`
        );
      }
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
  maxRequests: 30,            // Passkey login isn't brute-forceable (requires biometric)
});

export const passwordLoginLimiter = new RateLimiter({
  prefix: 'password_login',
  windowMs: 15 * 60 * 1000,  // 15 minutes
  maxRequests: 5,            // Stricter than passkey's 10
});

export const totpChallengeLimiter = new RateLimiter({
  prefix: 'totp_challenge',
  windowMs: 5 * 60 * 1000,   // 5 minutes
  maxRequests: 5,             // 5 TOTP attempts per 5 minutes — brute-force infeasible
});

export const signupLimiter = new RateLimiter({
  prefix: 'signup',
  windowMs: 60 * 60 * 1000,  // 1 hour
  maxRequests: 5,
});

// Age-verification challenge minting — keyed by userId. Bounds how many single-use
// nonces one account can write into the shared nonce store (each has a 10-min TTL).
export const ageChallengeLimiter = new RateLimiter({
  prefix: 'age-challenge',
  windowMs: 10 * 60 * 1000,  // 10 minutes
  maxRequests: 12,
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

export const vibeLimiter = new RateLimiter({
  prefix: 'vibe',
  windowMs: 60 * 1000,        // 1 minute
  maxRequests: 30,             // Allows rapid reactions but blocks automated spam
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

// In-app tribe invites (issue #58) — capped per-user per-day across all
// tribes to deter invite spam while allowing normal founder onboarding bursts.
export const tribeInviteLimiter = new RateLimiter({
  prefix: 'tribe-invite',
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  maxRequests: 30,
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
 * Trust ONLY the headers our own Caddy reverse proxy sets (x-forwarded-for /
 * x-real-ip). We deliberately do NOT honor CDN headers like cf-connecting-ip —
 * we never sit behind Cloudflare, so trusting one would let any client forge
 * its IP (and defeat the geo age-gate) with a single header.
 */
export function getClientIp(headersList: Headers): string {
  return (
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    headersList.get('x-real-ip') ??
    '127.0.0.1'
  );
}

/**
 * Extract the /24 subnet from an IPv4 address.
 * Used for subnet-level swarm detection.
 * e.g. "203.0.113.45" → "203.0.113.0/24"
 * Falls back to the full IP for IPv6.
 */
export function getSubnet(ip: string): string {
  const parts = ip.split('.');
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
  }
  return ip; // IPv6: treat full address as key
}

/**
 * Subnet-level signup limiter: 8 registrations per /24 per 24 hours.
 * Catches residential proxy swarms that rotate IPs within the same block.
 * Much harder to bypass than per-IP limiting — requires the attacker to
 * distribute across more expensive, unrelated IP blocks.
 */
export const signupSubnetLimiter = new RateLimiter({
  prefix: 'signup_subnet',
  windowMs: 24 * 60 * 60 * 1000,  // 24 hours
  maxRequests: 8,
});

export const nciiReportLimiter = new RateLimiter({
  prefix: 'ncii_report',
  windowMs: 60 * 60 * 1000,   // 1 hour
  maxRequests: 3,              // 3 reports per IP per hour
});

export const nciiStatusLimiter = new RateLimiter({
  prefix: 'ncii_status',
  windowMs: 60 * 60 * 1000,   // 1 hour
  maxRequests: 10,             // 10 lookups per IP per hour
});

export const nciiAdminKeysLimiter = new RateLimiter({
  prefix: 'ncii_admin_keys',
  windowMs: 60 * 60 * 1000,   // 1 hour
  maxRequests: 10,             // 10 lookups per IP per hour
});
