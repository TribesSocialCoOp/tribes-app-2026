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

export type WalletProvider = 'google_wallet' | 'apple_wallet';

/** True if this browser exposes the Digital Credentials API. */
export function isDigitalCredentialsSupported(): boolean {
  return typeof window !== 'undefined'
    && 'credentials' in navigator
    && typeof (window as unknown as { DigitalCredential?: unknown }).DigitalCredential !== 'undefined';
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

  // 2. Browser presents the wallet picker and returns the (encrypted) response.
  if (!isDigitalCredentialsSupported()) {
    throw new Error('This browser cannot present a wallet credential. Try Chrome on Android, or the mobile app.');
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
