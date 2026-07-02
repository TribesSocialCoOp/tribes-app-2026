/**
 * Client-side bridge for Apple's Declared Age Range (issue #32) — iOS 26.2+ native.
 *
 * Invokes OUR native Capacitor plugin `AgeRange` (ios/App/App/AgeRangePlugin.swift),
 * which calls `AgeRangeService.requestAgeRange(ageGates: 18, …)` and returns the age
 * band + a NORMALIZED declaration level (how Apple established the age). No birthdate or
 * ID crosses the bridge — only `over18` + the assurance level.
 *
 * The server anchors trust to the single-use `nonce` (from createIosAgeChallenge) and,
 * in Phase 2, an App Attest assertion over it — see providers/apple-declared-age.ts.
 * Until App Attest lands, the result is prod-rejected server-side.
 */

/**
 * Declaration levels that count as CONFIRMED for a law state (see Decision 2 in
 * providers/apple-declared-age.ts — bare self-declaration is rejected there). Single
 * source of truth, shared by the server policy check and the client pre-check so the
 * two can't drift.
 */
export const CONFIRMED_AGE_DECLARATIONS: ReadonlySet<string> = new Set(['government_id', 'payment']);

/**
 * User-facing guidance for the self-declared case: the account says 18+, but Apple
 * hasn't confirmed it. Steps per Apple Support (support.apple.com/125662): iOS can
 * confirm adulthood from account history, a credit card, or a government ID / passport
 * (region-dependent) — Apple shares only the RESULT with us, never the document.
 */
export const UNCONFIRMED_AGE_GUIDANCE =
  'Your Apple Account lists you as 18+, but Apple hasn’t confirmed it yet. ' +
  'On your iPhone, open Settings → your name → Personal Information and confirm your age — ' +
  'Apple can confirm it from your account history, a credit card, or an ID, and only ever ' +
  'shares the result with us (never your documents or birthdate). Then try again here.';

/** Result the native plugin returns for a Declared Age Range request. */
export interface DeclaredAgeResult {
  /** False when the OS API is unavailable (iOS < 26.2) or the person declined sharing. */
  available: boolean;
  /** True specifically when the person tapped "Don't Share" (vs the OS being too old),
   *  so we can show a decline-specific message rather than an "update iOS" one. */
  declined?: boolean;
  over18?: boolean;
  /** Normalized level: self_declared | guardian_declared | government_id | payment | other | unknown. */
  declaration?: string;
  /** App Attest assertion envelope (Phase 2); absent until implemented natively. */
  appAttest?: unknown;
}

type AgeRangePlugin = { getDeclaredAgeRange: (o: unknown) => Promise<DeclaredAgeResult> };

function nativePlugin(): AgeRangePlugin | null {
  if (typeof window === 'undefined') return null;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const p = plugins?.AgeRange as AgeRangePlugin | undefined;
  return typeof p?.getDeclaredAgeRange === 'function' ? p : null;
}

/** Whether the iOS Declared Age Range plugin is present in this runtime. */
export function isDeclaredAgeAvailable(): boolean {
  return nativePlugin() !== null;
}

/**
 * Run the OS age check anchored to `nonce`. Returns the plugin result to submit.
 *
 * When the native plugin is ABSENT (web, simulator, or — importantly — a real device
 * where AgeRangePlugin/MainViewController wasn't wired into the Xcode target), we do NOT
 * silently stub by default: that masks a broken native registration as a working flow.
 * The dev stub is OPT-IN via NEXT_PUBLIC_IOS_AGE_STUB=true (non-production only) and logs
 * loudly, so "it worked on my device" always means the real plugin ran.
 */
export async function runIosDeclaredAgeCheck(userId: string, nonce: string): Promise<DeclaredAgeResult> {
  const plugin = nativePlugin();
  if (plugin) {
    const result = await plugin.getDeclaredAgeRange({ challengeUserId: userId, nonce });
    if (!result?.available) {
      if (result?.declined) {
        throw new Error('Age sharing was declined. To continue, allow your iPhone to share your age range and try again.');
      }
      throw new Error('Your iPhone can’t confirm your age here. This needs iOS 26.2 or later with an age set on your Apple Account.');
    }
    return result;
  }
  const stubEnabled = process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_IOS_AGE_STUB === 'true';
  if (stubEnabled) {
    // DEV STUB (opt-in, non-prod) — no native plugin. Server rejects it in real prod.
    // eslint-disable-next-line no-console
    console.warn('[age] AgeRange native plugin ABSENT — using DEV STUB (NEXT_PUBLIC_IOS_AGE_STUB). This is NOT the real OS check.');
    return { available: true, over18: true, declaration: 'government_id' };
  }
  throw new Error('Age confirmation isn’t available on this device. Please update to iOS 26.2 or later.');
}
