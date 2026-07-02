/**
 * Client-side wallet verification runner (issue #32).
 *
 * For web: drives the W3C Digital Credentials API
 * (navigator.credentials.get({ digital })) using a server-built OpenID4VP request,
 * then hands the wallet response back to the server to verify + set the flag.
 *
 * On native (Capacitor) the same shape will be produced by a native plugin instead of
 * navigator.credentials; the server verification path is identical.
 */
import { createAgeVerificationRequest, createIosAgeChallenge, submitAgeVerification } from '@/lib/actions/age-actions';
import { isNative, isIos, isAndroid } from '@/lib/capacitor/platform';
import { isOnDeviceAgeAvailable } from './on-device-age';

export type WalletProvider = 'google_wallet' | 'apple_wallet';

/**
 * Whether a verification provider can actually run on THIS device, with a hint that
 * points the user to where it works when it can't. Used to grey out (rather than fail)
 * methods that aren't usable on the current surface — e.g. Google Wallet needs the
 * Digital Credentials API, which realistically means an Android device.
 */
export function providerSupport(id: string): { enabled: boolean; hint?: string } {
  if (id === 'dev') return { enabled: true };

  if (id === 'privately') {
    // PARKED: the on-device provider is disabled (providers/privately.ts), so this
    // branch is currently unreachable. Kept for the future self-hosted-model revive.
    return isOnDeviceAgeAvailable()
      ? { enabled: true }
      : { enabled: false, hint: 'On-device age check runs in the Tribes mobile app.' };
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const dc = isDigitalCredentialsSupported();

  if (id === 'google_wallet') {
    const android = (isNative && isAndroid) || /Android/i.test(ua);
    return dc && android
      ? { enabled: true }
      : { enabled: false, hint: 'Verify with Google Wallet on an Android device — open tribes.app in Chrome on Android, or use the Tribes Android app.' };
  }

  if (id === 'apple_wallet') {
    // DISABLED: Apple prohibits Apple Wallet / its Digital ID for adult-content age
    // gating, so the apple_wallet provider is off (providers/apple-wallet.ts) and never
    // reaches this branch. Kept for shape only.
    const ios = (isNative && isIos) || /iPhone|iPad|iPod/i.test(ua);
    return dc && ios
      ? { enabled: true }
      : { enabled: false, hint: 'Verify with Apple Wallet on an iPhone (iOS 26+) with a digital ID.' };
  }

  if (id === 'apple_declared_age_range') {
    // iOS-native only (Apple Declared Age Range OS signal, iOS 26.2+). The plugin
    // reports availability at runtime; here we just gate to the iOS app.
    return isNative && isIos
      ? { enabled: true }
      : { enabled: false, hint: 'Confirm your age in the Tribes iPhone app (iOS 26.2 or later).' };
  }

  return { enabled: true };
}

/**
 * True if the current runtime exposes the W3C Digital Credentials API.
 *
 * This is the same on web and inside the Capacitor WKWebView: on iOS 26 WebKit ships
 * the API (it's a WebKit feature, so the app's WKWebView inherits it), and on Android
 * Chrome/WebView via Credential Manager. We gate purely on the `DigitalCredential`
 * global rather than platform sniffing, so it lights up wherever the OS actually
 * provides it. See docs/plan-wallet-age-verification.md (iOS section).
 */
export function isDigitalCredentialsSupported(): boolean {
  return typeof window !== 'undefined'
    && 'credentials' in navigator
    && typeof (window as unknown as { DigitalCredential?: unknown }).DigitalCredential !== 'undefined';
}

/** Platform-appropriate message when the wallet flow can't run here. */
function unsupportedMessage(): string {
  if (isNative && isIos) {
    return 'Wallet verification needs iOS 26 or later with a digital ID in Apple Wallet. Please update iOS, then try again.';
  }
  if (isNative && isAndroid) {
    return 'Wallet verification needs Google Wallet with a digital ID on this device.';
  }
  return 'This browser cannot present a wallet credential yet. Try Chrome on Android, Safari on iOS 26, or the mobile app.';
}

function unwrap<T>(result: T | { serverError: string }): T {
  if (result && typeof result === 'object' && 'serverError' in result) {
    throw new Error((result as { serverError: string }).serverError);
  }
  return result as T;
}

/**
 * Run the full wallet verification for `provider`. Resolves to the verified method on
 * success; throws with a user-safe message otherwise.
 */
export async function runWalletVerification(provider: WalletProvider): Promise<{ verified: boolean; method: string }> {
  const origin = window.location.origin;

  // 1. Server builds the signed OpenID4VP request + sealed verifier state.
  const { request, verifierState } = unwrap(await createAgeVerificationRequest(provider, origin));

  // 2. Browser / WKWebView presents the wallet picker and returns the (encrypted)
  //    response. On iOS 26 the app's WebKit WebView exposes this natively.
  if (!isDigitalCredentialsSupported()) {
    throw new Error(unsupportedMessage());
  }
  const credential = await (navigator.credentials.get as (o: unknown) => Promise<unknown>)({
    mediation: 'required',
    digital: { requests: [request] },
  });

  // The DC API returns an object with the protocol response (data/response).
  const response = (credential as { data?: unknown; response?: unknown }) ?? {};

  // 3. Server decrypts, verifies the mdoc against IACA anchors, and stamps the flag.
  return unwrap(await submitAgeVerification({
    provider,
    attestation: { verifierState, origin, response },
  }));
}

/**
 * Run on-device (Privately) age verification — the universal path that also works
 * on iOS (no wallet / DC-API). The device produces a signed credential; the server
 * validates it. Resolves to the verified method on success; throws otherwise.
 *
 * ⚠️ PARKED (2026-07): unreachable while the on-device provider is disabled
 * (providers/privately.ts). Kept for the future self-hosted-model revive.
 */
export async function runOnDeviceVerification(userId: string): Promise<{ verified: boolean; method: string }> {
  const { runOnDeviceAgeCheck } = await import('./on-device-age');
  const attestation = await runOnDeviceAgeCheck(userId);
  return unwrap(await submitAgeVerification({ provider: 'privately', attestation }));
}

/**
 * Run Apple's Declared Age Range OS check (iOS 26.2+ native) and submit it. Gets a
 * single-use server nonce, runs the native plugin anchored to it, then submits the
 * band + declaration level. Resolves to the verified method on success; throws with a
 * user-safe message otherwise (declined, too-old iOS, or an unconfirmed declaration
 * that doesn't clear a law state — surfaced as a failed attempt).
 */
export async function runDeclaredAgeVerification(userId: string): Promise<{ verified: boolean; method: string }> {
  const { nonce } = unwrap(await createIosAgeChallenge());
  const { runIosDeclaredAgeCheck, CONFIRMED_AGE_DECLARATIONS, UNCONFIRMED_AGE_GUIDANCE } =
    await import('./ios-declared-age');
  const result = await runIosDeclaredAgeCheck(userId, nonce);

  // Pre-check the declaration level BEFORE submitting so the common self-declared case
  // gets actionable guidance (confirm your age with Apple) instead of a generic
  // "verification did not succeed". The server enforces the same policy regardless.
  if (result.over18 !== true) {
    throw new Error('Your Apple Account doesn’t show you as 18 or older, so adult content can’t be enabled here.');
  }
  if (!CONFIRMED_AGE_DECLARATIONS.has(result.declaration ?? 'unknown')) {
    throw new Error(UNCONFIRMED_AGE_GUIDANCE);
  }

  return unwrap(await submitAgeVerification({
    provider: 'apple_declared_age_range',
    attestation: { nonce, over18: result.over18, declaration: result.declaration, appAttest: result.appAttest },
  }));
}
