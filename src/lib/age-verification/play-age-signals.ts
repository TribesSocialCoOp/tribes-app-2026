/**
 * Client-side bridge for Google Play Age Signals (issue #32) — Android native.
 *
 * Invokes OUR native Capacitor plugin `AgeSignals` (android/.../AgeSignalsPlugin.java),
 * which calls the Play Age Signals API and returns the user's status + age band. The
 * Android analog of ios-declared-age.ts. No birthdate crosses the bridge — only the
 * normalized over-18 signal + status.
 *
 * The server anchors trust to the single-use `nonce` (from createPlayAgeChallenge) and,
 * in Phase 2, a Play Integrity token over it — see providers/play-age-signals.ts. Until
 * that lands, the result is prod-rejected server-side.
 */

/** Result the native plugin returns for a Play Age Signals request. */
export interface PlayAgeResult {
  /** False when the API is unavailable / errored, or the user shares no age signal. */
  available: boolean;
  /** True when the user's status is null/UNKNOWN (in-jurisdiction but no usable signal),
   *  so the client can message "couldn't read a signal" vs a device error. */
  noSignal?: boolean;
  over18?: boolean;
  /** Play userStatus: VERIFIED | DECLARED | SUPERVISED | SUPERVISED_APPROVAL_PENDING |
   *  SUPERVISED_APPROVAL_DENIED | UNKNOWN. */
  userStatus?: string;
  /** Supervised (Family Link) child account — the parental-controls equivalent. */
  parentalControlsActive?: boolean;
  /** Raw age band (diagnostics / logging). */
  ageLower?: number;
  ageUpper?: number;
  /** Play Integrity token envelope (Phase 2); absent until implemented natively. */
  integrityToken?: unknown;
}

type AgeSignalsPlugin = { checkAgeSignals: (o: unknown) => Promise<PlayAgeResult> };

function nativePlugin(): AgeSignalsPlugin | null {
  if (typeof window === 'undefined') return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const p = plugins?.AgeSignals as AgeSignalsPlugin | undefined;
  return typeof p?.checkAgeSignals === 'function' ? p : null;
}

/** Whether the Play Age Signals plugin is present in this runtime. */
export function isPlayAgeSignalsAvailable(): boolean {
  return nativePlugin() !== null;
}

/**
 * Run the Play Age Signals check anchored to `nonce`. Returns the plugin result to
 * submit. Mirrors the iOS bridge: absent the native plugin we do NOT silently stub by
 * default — the dev stub is opt-in via NEXT_PUBLIC_ANDROID_AGE_STUB=true (non-production
 * only) and logs loudly, so a broken native registration can't masquerade as working.
 */
export async function runPlayAgeCheck(nonce: string): Promise<PlayAgeResult> {
  const plugin = nativePlugin();
  if (plugin) {
    const result = await plugin.checkAgeSignals({ nonce });
    if (!result?.available) {
      if (result?.noSignal) {
        throw new Error('Google Play didn’t return an age signal for your account here. Please try again.');
      }
      throw new Error('Age confirmation isn’t available on this device. Please update Google Play services and try again.');
    }
    return result;
  }
  const stubEnabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ANDROID_AGE_STUB === 'true';
  if (stubEnabled) {
    // eslint-disable-next-line no-console
    console.warn('[age] AgeSignals native plugin ABSENT — using DEV STUB (NEXT_PUBLIC_ANDROID_AGE_STUB). This is NOT the real Play check.');
    return { available: true, over18: true, userStatus: 'DECLARED' };
  }
  throw new Error('Age confirmation isn’t available on this device.');
}
