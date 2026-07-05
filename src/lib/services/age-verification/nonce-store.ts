/**
 * @fileoverview Single-use store for age-verification nonces (issue #32).
 *
 * Replay hardening (defense-in-depth on top of the userId binding sealed into the
 * verifier state): a server-issued nonce can be consumed exactly once, within its
 * TTL. Uses Valkey (Redis protocol) when VALKEY_URL is set — the TTL auto-expires
 * entries, so there is NO cleanup/migration/management code — and falls back to an
 * in-memory map for local dev/testing. Stores only the bound userId; no PII.
 *
 * Infra failures fail OPEN (the cryptographic userId binding in oid4vp.ts is the
 * actual security boundary; single-use is a secondary guard), matching the
 * rate-limiter's availability-first behaviour.
 *
 * Server-only.
 */

const KEY_PREFIX = 'age:verify:nonce:';

// ── Valkey backend (production) ───────────────────────────────
let redis: import('ioredis').Redis | null = null;
function getRedis(): import('ioredis').Redis | null {
  if (!process.env.VALKEY_URL) return null;
  if (!redis) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Redis } = require('ioredis');
    redis = new Redis(process.env.VALKEY_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      enableReadyCheck: false,
    });
    redis!.on('error', () => { /* surfaced at call sites; never throw on the listener */ });
  }
  return redis;
}

// ── In-memory fallback (local dev / tests) ────────────────────
// In production this fallback silently weakens the single-use guarantee to
// per-process (and breaks it across instances), so shout once if it's ever hit there.
const mem = new Map<string, { userId: string; expiresAt: number }>();
let warnedMemFallback = false;
function warnIfProdMemFallback(): void {
  if (warnedMemFallback || process.env.NODE_ENV !== 'production') return;
  warnedMemFallback = true;
  console.error(
    '[age-nonce] VALKEY_URL is not set in production — age-verification nonces are '
    + 'stored in-memory (per-process, not shared across instances). Set VALKEY_URL.',
  );
}

/** Record an issued nonce, bound to a user, valid for `ttlSeconds`. Best-effort. */
export async function issueNonce(nonce: string, userId: string, ttlSeconds: number): Promise<void> {
  const client = getRedis();
  if (client) {
    try {
      await client.set(KEY_PREFIX + nonce, userId, 'EX', ttlSeconds);
    } catch {
      // Infra hiccup — don't block issuing the request (userId binding still applies).
    }
    return;
  }
  warnIfProdMemFallback();
  mem.set(nonce, { userId, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/**
 * Atomically consume a nonce. Returns true only if it existed, was unused, not
 * expired, and bound to `userId`. A replay returns false.
 *
 * On a Valkey infra error the default is fail OPEN — for the wallet providers the nonce
 * is a SECONDARY guard on top of the cryptographic userId binding sealed in the verifier
 * state, so availability wins. Providers whose nonce is the PRIMARY (only) binding —
 * e.g. the Apple Declared Age Range provider, which carries no signature — must pass
 * `{ failClosed: true }` so an infra outage can't wave through an unbound/replayed nonce.
 */
export async function consumeNonce(
  nonce: string,
  userId: string,
  opts?: { failClosed?: boolean },
): Promise<boolean> {
  const client = getRedis();
  if (client) {
    try {
      // GETDEL = atomic read-and-delete → single-use. Valkey / Redis 6.2+.
      const stored = await client.getdel(KEY_PREFIX + nonce);
      return stored !== null && stored === userId;
    } catch {
      // Fail open (secondary guard) unless the caller says this nonce is the only guard.
      return !opts?.failClosed;
    }
  }
  const entry = mem.get(nonce);
  mem.delete(nonce); // single-use even on mismatch/expiry
  if (!entry || entry.expiresAt < Date.now()) return false;
  return entry.userId === userId;
}
