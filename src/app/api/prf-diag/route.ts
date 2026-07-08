/**
 * @fileoverview PRF / key-sync diagnostic sink — POST /api/prf-diag
 *
 * Mirrors client `prfDebug()` events into the SERVER logs, but ONLY for a single
 * targeted credential set via the `PASSKEY_DEBUG_CREDENTIAL_PREFIX` env var
 * (the same gate used by the passkey auth ceremony logging in lib/auth/passkeys).
 *
 * Why: PRF traces from the native iOS WebView (Capacitor) are otherwise
 * unreachable — Safari Web Inspector can't attach and `window.__prfDebug` lives
 * only in that WebView. This lands `login.prf.*` / `sync.pull.*` in the same log
 * stream as `[passkey-debug]` so native-only failures can be diagnosed remotely.
 *
 * Privacy / cost:
 * - When the env var is UNSET this endpoint is a cheap no-op (204): no DB, no
 *   logs, nothing retained. That is the normal production posture.
 * - When SET, it logs only the metadata the client already prints to its own
 *   console (types, lengths, booleans, truncated ids, counts) — never key
 *   material. See the security note in src/lib/crypto/prf-debug.ts.
 */

import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const noContent = () => new NextResponse(null, { status: 204 });

export async function POST(req: NextRequest) {
  const prefix = process.env.PASSKEY_DEBUG_CREDENTIAL_PREFIX;
  // Feature off → no-op. No DB, no logs. (Common prod case.)
  if (!prefix) return noContent();

  let body: { t?: string; event?: string; data?: unknown; cid?: string };
  try {
    body = await req.json();
  } catch {
    return noContent();
  }

  const { t, event, data, cid } = body;
  if (typeof event !== 'string') return noContent();

  // Is this event for the targeted credential?
  let isTarget = false;

  // Fast path: the event carried a credential-id prefix (login.* / sync.save /
  // sync.pull.noVault do). Pure string compare, no DB.
  if (typeof cid === 'string' && cid.length > 0 && (cid.startsWith(prefix) || prefix.startsWith(cid))) {
    isTarget = true;
  } else {
    // Many sync events omit the credential id — fall back to the session user and
    // log if ANY of their registered credentials matches the debug prefix.
    try {
      const { getCurrentUserId } = await import('@/lib/auth/session');
      const userId = await getCurrentUserId();
      if (userId) {
        const { db } = await import('@/db');
        const { credentials } = await import('@/db/schema');
        const { eq } = await import('drizzle-orm');
        const rows = await db.query.credentials.findMany({ where: eq(credentials.userId, userId) });
        isTarget = rows.some((r) => typeof r.id === 'string' && r.id.startsWith(prefix));
      }
    } catch {
      /* best-effort diagnostics — never fail the request */
    }
  }

  if (isTarget) {
    // Same stream as [passkey-debug] so both halves of a login sit together.
    // eslint-disable-next-line no-console
    console.log(`[prf-diag] ${t ?? ''} ${event}`, data ? JSON.stringify(data) : '');
  }

  return noContent();
}
