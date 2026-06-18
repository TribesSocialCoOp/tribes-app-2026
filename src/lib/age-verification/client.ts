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
import { createAgeVerificationRequest, submitAgeVerification } from '@/lib/actions/age-actions';
import { isNative, isIos, isAndroid } from '@/lib/capacitor/platform';

export type WalletProvider = 'google_wallet' | 'apple_wallet';

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
