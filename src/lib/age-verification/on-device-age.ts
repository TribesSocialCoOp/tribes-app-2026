/**
 * Client-side bridge for on-device age estimation (issue #32) — Privately.
 *
 * The check runs ON THE DEVICE and returns a SIGNED credential the server
 * validates (see services/age-verification/providers/privately.ts). No image
 * leaves the device.
 *
 * NOTE: `AgeEstimation` below is OUR Capacitor plugin name — a thin wrapper we
 * build around Privately's actual SDK (`PrivatelyCore` / `privately-sdk:*` on
 * native; Privately's browser SDK on web). It is NOT a plugin Privately ships.
 *
 * Environment patterns:
 *   - SDK present (dev OR prod) → REAL Privately flow runs (this is the goal:
 *     full local testing without deploying, once the SDK + keys are installed).
 *   - SDK absent + non-production → DEV STUB (fake pass) for wiring/CI only.
 *   - production + stub → HARD-REJECTED server-side. The stub can never ship.
 */

/** Attestation handed to submitAgeVerification({ provider: 'privately', attestation }). */
export interface OnDeviceAttestation {
  kind: string; // 'privately' (real signed credential) | 'stub' (dev only)
  ageOver18?: boolean;
  userId?: string;
  [k: string]: unknown;
}

/** Whether a native Privately plugin is present in this runtime. */
function hasNativePlugin(): boolean {
  if (typeof window === 'undefined') return false;
  const plugins = (window as unknown as { Capacitor?: { Plugins?: Record<string, unknown> } }).Capacitor?.Plugins;
  const ageEstimation = plugins?.AgeEstimation as { estimateAge?: unknown } | undefined;
  return typeof ageEstimation?.estimateAge === 'function';
}

/** True if on-device age estimation can run here (real native plugin, or dev stub). */
export function isOnDeviceAgeAvailable(): boolean {
  return hasNativePlugin() || process.env.NODE_ENV !== 'production';
}

/**
 * Run the on-device age check and return an attestation to submit to the server.
 * Native plugin → real signed credential; otherwise the dev stub (non-prod only).
 */
export async function runOnDeviceAgeCheck(userId: string): Promise<OnDeviceAttestation> {
  if (hasNativePlugin()) {
    const plugins = (window as unknown as { Capacitor: { Plugins: Record<string, { estimateAge: (o: unknown) => Promise<OnDeviceAttestation> }> } }).Capacitor.Plugins;
    // Pass the user as a challenge anchor; the native plugin runs the Privately SDK
    // on-device and returns a SIGNED credential the server verifies.
    return plugins.AgeEstimation.estimateAge({ challengeUserId: userId });
  }
  if (process.env.NODE_ENV !== 'production') {
    // DEV STUB — no SDK yet. Server rejects this in production (see privately.ts).
    return { kind: 'stub', ageOver18: true, userId };
  }
  throw new Error('On-device age verification isn’t available on this device yet.');
}
