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

/** Result the native plugin returns for a Declared Age Range request. */
export interface DeclaredAgeResult {
  /** False when the OS API is unavailable (iOS < 26.2) or the person declined sharing. */
  available: boolean;
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
 * Run the OS age check anchored to `nonce`. Returns the plugin result to submit. On a
 * device without the plugin, a non-production DEV STUB returns a fake confirmed result
 * (server rejects it in prod) so the wiring is exercisable off-device.
 */
export async function runIosDeclaredAgeCheck(userId: string, nonce: string): Promise<DeclaredAgeResult> {
  const plugin = nativePlugin();
  if (plugin) {
    const result = await plugin.getDeclaredAgeRange({ challengeUserId: userId, nonce });
    if (!result?.available) {
      throw new Error('Your iPhone can’t confirm your age here. This needs iOS 26.2 or later with an age set on your Apple Account.');
    }
    return result;
  }
  if (process.env.NODE_ENV !== 'production') {
    // DEV STUB — no native plugin (e.g. web/simulator). Prod-rejected server-side.
    return { available: true, over18: true, declaration: 'government_id' };
  }
  throw new Error('Age confirmation isn’t available on this device. Please update to iOS 26.2 or later.');
}
