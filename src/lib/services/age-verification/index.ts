/**
 * @fileoverview Age-verification dispatcher (issue #32).
 * Routes an attestation to the selected provider and returns pass/fail.
 * See ./types and ./providers/* and docs/plan-wallet-age-verification.md.
 */
import type {
  AgeVerificationProvider,
  AgeVerificationRequest,
  AgeVerificationResult,
  AgeVerificationContext,
} from './types';
import { ProviderUnavailableError } from './types';
import { devProvider } from './providers/dev';
import { googleWalletProvider } from './providers/google-wallet';
import { appleWalletProvider } from './providers/apple-wallet';
import { appleDeclaredAgeProvider } from './providers/apple-declared-age';
import { privatelyProvider } from './providers/privately';

const REGISTRY: Record<string, AgeVerificationProvider> = {
  google_wallet: googleWalletProvider,
  apple_wallet: appleWalletProvider,
  apple_declared_age_range: appleDeclaredAgeProvider,
  privately: privatelyProvider,
  dev: devProvider,
};

/** Providers usable in the current environment — drives which buttons the client shows. */
export function availableAgeProviders(): { id: string; label: string }[] {
  return Object.values(REGISTRY)
    .filter((p) => p.isAvailable())
    .map((p) => ({ id: p.id, label: p.label }));
}

/**
 * Validate an attestation via its provider. Throws if the provider is unavailable.
 * `expectedUserId` is the authenticated caller; wallet providers bind the attestation
 * to it so a response can only verify the account that requested it.
 */
export async function verifyAge(req: AgeVerificationRequest, expectedUserId: string): Promise<AgeVerificationResult> {
  if (!expectedUserId) throw new Error('verifyAge requires the authenticated userId.');
  const provider = REGISTRY[req.provider];
  if (!provider || !provider.isAvailable()) {
    throw new ProviderUnavailableError(req.provider);
  }
  const ctx: AgeVerificationContext = { expectedUserId };
  return provider.verify(req, ctx);
}
