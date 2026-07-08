/**
 * @fileoverview Lightweight PRF / key-sync debug collector (browser only).
 *
 * Logs to the console with a `[prf-debug]` prefix AND appends to a ring buffer
 * at `window.__prfDebug`, so a tester can reproduce an issue and send the whole
 * trace with one console command:
 *
 *   copy(JSON.stringify(window.__prfDebug, null, 2))   // DevTools
 *   // or just expand window.__prfDebug
 *
 * SECURITY: never pass secret material here (PRF output bytes, wrapping key,
 * ciphertext, plaintext, private keys). Pass only metadata — types, lengths,
 * booleans, truncated ids, counts, error messages.
 */

interface PrfDebugEntry {
  t: string;
  event: string;
  data?: Record<string, unknown>;
}

const MAX_ENTRIES = 300;
const buffer: PrfDebugEntry[] = [];

export function prfDebug(event: string, data?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  const entry: PrfDebugEntry = { t: new Date().toISOString(), event, data };
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  try {
    (window as unknown as Record<string, unknown>).__prfDebug = buffer;
  } catch {
    /* ignore */
  }
  // eslint-disable-next-line no-console
  console.log(`[prf-debug] ${event}`, data ?? '');

  // Best-effort server mirror. The endpoint is a cheap 204 no-op unless a debug
  // credential prefix is configured server-side, so this is safe to always fire.
  // Lets us recover native-WebView (Capacitor) traces where DevTools can't attach
  // and window.__prfDebug is unreachable. keepalive survives the login→feed nav.
  try {
    const cid = typeof data?.credentialIdPrefix === 'string' ? data.credentialIdPrefix : undefined;
    void fetch('/api/prf-diag', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ t: entry.t, event, data, cid }),
      keepalive: true,
    }).catch(() => { /* diagnostics only — never surface */ });
  } catch {
    /* ignore */
  }
}

/** Returns the current debug buffer (for programmatic collection). */
export function getPrfDebug(): PrfDebugEntry[] {
  return buffer;
}

/**
 * Safely summarizes a value's SHAPE without revealing its contents — used to
 * inspect what an authenticator returned for `prf.results.first` across
 * browsers (Firefox vs Chrome) and platforms (web vs Capacitor native).
 */
export function describeShape(v: unknown): Record<string, unknown> {
  // `tag` is the realm-safe descriptor (Object.prototype.toString), which still
  // reads "[object ArrayBuffer]" for a cross-realm buffer where `instanceof`
  // (and Object.keys) would mislead — critical for diagnosing Firefox.
  const tag = (() => { try { return Object.prototype.toString.call(v); } catch { return '?'; } })();
  if (v === undefined) return { kind: 'undefined', tag };
  if (v === null) return { kind: 'null', tag };
  if (typeof v === 'string') return { kind: 'string', length: v.length, tag };
  if (v instanceof ArrayBuffer) return { kind: 'ArrayBuffer', byteLength: v.byteLength, tag };
  if (ArrayBuffer.isView(v)) return { kind: 'ArrayBufferView', byteLength: (v as ArrayBufferView).byteLength, tag };
  if (typeof v === 'object') return { kind: 'object', tag, keys: Object.keys(v as object).slice(0, 12), byteLength: (v as { byteLength?: number }).byteLength ?? null };
  return { kind: typeof v, tag };
}
