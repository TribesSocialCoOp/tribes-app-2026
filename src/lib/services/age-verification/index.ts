/**
 * @fileoverview Age-verification dispatcher (issue #32).
 * Routes an attestation to the selected provider and returns pass/fail.
 * See ./types and ./providers/* and docs/plan-wallet-age-verification.md.
 */
import type {
  AgeVerificationProvider,
  AgeVerificationRequest,
  AgeVerificationResult,
} from './types';
import { ProviderUnavailableError } from './types';
import { devProvider } from './providers/dev';
import { googleWalletProvider } from './providers/google-wallet';
import { appleWalletProvider } from './providers/apple-wallet';

const REGISTRY: Record<string, AgeVerificationProvider> = {
  google_wallet: googleWalletProvider,
  apple_wallet: appleWalletProvider,
  dev: devProvider,
};

/** Providers usable in the current environment — drives which buttons the client shows. */
export function availableAgeProviders(): { id: string; label: string }[] {
  return Object.values(REGISTRY)
    .filter((p) => p.isAvailable())
    .map((p) => ({ id: p.id, label: p.label }));
}

/** Validate an attestation via its provider. Throws if the provider is unavailable. */
export async function verifyAge(req: AgeVerificationRequest): Promise<AgeVerificationResult> {
  const provider = REGISTRY[req.provider];
  if (!provider || !provider.isAvailable()) {
    throw new ProviderUnavailableError(req.provider);
  }
  return provider.verify(req);
}
