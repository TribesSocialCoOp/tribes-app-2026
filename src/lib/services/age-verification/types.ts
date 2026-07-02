/**
 * @fileoverview Age-verification provider abstraction (issue #32).
 *
 * One server-side decision point for 18+ verification. Each provider takes a
 * platform-specific attestation and returns a simple pass/fail + the method used.
 * The platform stores ONLY the outcome (see users.ageVerifiedAt / .ageVerificationMethod)
 * — never a birthdate, name, or credential.
 *
 * v1 high-assurance providers (verifiable, privacy-preserving):
 *   - google_wallet : Google Wallet ZKP via Digital Credentials API (OpenID4VP / mso_mdoc_zk)
 *   - apple_wallet  : Apple ID-in-Wallet (mDL or US passport) via OpenID4VP selective disclosure
 * Plus a dev provider for local/staging testing of the gate (never enabled in production).
 */

export type AgeVerificationMethod =
  | 'google_zkp'
  | 'apple_wallet_mdl'
  | 'apple_wallet_passport'
  | 'apple_declared_age_range'  // iOS Declared Age Range OS signal (confirmed level) — iOS 26.2+ native
  | 'privately'      // on-device facial age estimation (Privately SDK) — universal incl. iOS
  | 'dev';

export interface AgeVerificationRequest {
  /** Which provider produced the attestation. */
  provider: 'google_wallet' | 'apple_wallet' | 'apple_declared_age_range' | 'privately' | 'dev';
  /** Provider-specific attestation payload (e.g. an OpenID4VP vp_token, the iOS
   *  Declared Age Range envelope, or the Privately on-device signed credential).
   *  Absent for dev. */
  attestation?: unknown;
}

export interface AgeVerificationResult {
  verified: boolean;
  method: AgeVerificationMethod;
  /** Server-issued nonce that scoped this attestation. The action consumes it
   *  (single-use) before stamping the account. Absent for the dev provider. */
  nonce?: string;
  /** When true, the nonce is this provider's PRIMARY binding (no cryptographic userId
   *  seal), so its consumption must fail CLOSED on a nonce-store infra error. Set by
   *  providers like Apple Declared Age Range whose result isn't signed. */
  nonceFailClosed?: boolean;
}

export interface AgeVerificationProvider {
  /** Stable provider id used by the client and registry. */
  id: 'google_wallet' | 'apple_wallet' | 'apple_declared_age_range' | 'privately' | 'dev';
  /** Human label for the client UI. */
  label: string;
  /** Whether this provider is usable in the current environment/config. */
  isAvailable(): boolean;
  /**
   * Validate the attestation and return pass/fail. Implementations MUST do real
   * cryptographic verification (IACA chain, device signature, ZKP) for the wallet
   * providers — never trust a client-asserted boolean.
   *
   * `ctx.expectedUserId` is the authenticated caller; wallet providers MUST ensure
   * the attestation is bound to that same user (the verifier state seals it) so a
   * response cannot verify a different account.
   */
  verify(req: AgeVerificationRequest, ctx: AgeVerificationContext): Promise<AgeVerificationResult>;
}

/** Server-supplied context for a verification attempt (never from the client). */
export interface AgeVerificationContext {
  /** The authenticated user this verification will mark 18+ on success. */
  expectedUserId: string;
}

/** Thrown when a provider is selected but not configured/available. */
export class ProviderUnavailableError extends Error {
  constructor(providerId: string) {
    super(`Age-verification provider "${providerId}" is not available.`);
    this.name = 'ProviderUnavailableError';
  }
}
