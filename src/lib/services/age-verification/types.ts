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
  | 'dev';

export interface AgeVerificationRequest {
  /** Which provider produced the attestation. */
  provider: 'google_wallet' | 'apple_wallet' | 'dev';
  /** Provider-specific attestation payload (e.g. an OpenID4VP vp_token). Absent for dev. */
  attestation?: unknown;
  /** Server-issued one-time nonce that scoped the attestation request (replay protection). */
  nonce?: string;
}

export interface AgeVerificationResult {
  verified: boolean;
  method: AgeVerificationMethod;
}

export interface AgeVerificationProvider {
  /** Stable provider id used by the client and registry. */
  id: 'google_wallet' | 'apple_wallet' | 'dev';
  /** Human label for the client UI. */
  label: string;
  /** Whether this provider is usable in the current environment/config. */
  isAvailable(): boolean;
  /**
   * Validate the attestation and return pass/fail. Implementations MUST do real
   * cryptographic verification (IACA chain, device signature, ZKP) for the wallet
   * providers — never trust a client-asserted boolean.
   */
  verify(req: AgeVerificationRequest): Promise<AgeVerificationResult>;
}

/** Thrown when a provider is selected but not configured/available. */
export class ProviderUnavailableError extends Error {
  constructor(providerId: string) {
    super(`Age-verification provider "${providerId}" is not available.`);
    this.name = 'ProviderUnavailableError';
  }
}
