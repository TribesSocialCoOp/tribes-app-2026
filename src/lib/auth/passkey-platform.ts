/**
 * @fileoverview Platform-aware WebAuthn helpers.
 *
 * Abstracts the critical native vs web branching for passkey authentication
 * and registration so that:
 * 1. The logic is testable with mocks (not just grep)
 * 2. Login and signup pages stay thin
 * 3. The branching is centralized — not duplicated across pages
 */

import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';

/**
 * Authenticate with a passkey, using the correct API for the current platform.
 *
 * - Native (iOS/Android): Calls CapacitorPasskey.getCredential() directly.
 *   The plugin's createNativeRequest() uses `'mediation' in options` to
 *   distinguish auth from registration — mediation MUST be present.
 *
 * - Web: Uses @simplewebauthn/browser's startAuthentication() which handles
 *   ArrayBuffer conversion and getClientExtensionResults().
 */
export async function authenticatePasskey(
  optionsJSON: PublicKeyCredentialRequestOptionsJSON & { extensions?: any },
  isNative: boolean,
): Promise<AuthenticationResponseJSON> {
  if (isNative) {
    const { CapacitorPasskey } = await import('@capgo/capacitor-passkey');
    const result = await CapacitorPasskey.getCredential({
      // mediation MUST be present — the plugin uses 'mediation' in options
      // to distinguish auth from registration in createNativeRequest().
      // Without it, the plugin falls into the registration branch and
      // crashes on options.publicKey.rp.id (which doesn't exist for auth).
      mediation: 'optional',
      publicKey: {
        challenge: optionsJSON.challenge,
        rpId: optionsJSON.rpId,
        timeout: optionsJSON.timeout,
        allowCredentials: optionsJSON.allowCredentials?.map((c) => ({
          id: c.id,
          type: (c.type || 'public-key') as 'public-key',
          transports: c.transports,
        })),
        userVerification: optionsJSON.userVerification,
        extensions: optionsJSON.extensions,
      },
    });
    return result as unknown as AuthenticationResponseJSON;
  }

  const { startAuthentication } = await import('@simplewebauthn/browser');
  return startAuthentication({ optionsJSON });
}

/**
 * Register a new passkey, using the correct API for the current platform.
 *
 * - Native (iOS/Android): Calls CapacitorPasskey.createCredential() directly.
 * - Web: Uses @simplewebauthn/browser's startRegistration().
 */
export async function registerPasskey(
  optionsJSON: any,
  isNative: boolean,
): Promise<RegistrationResponseJSON> {
  if (isNative) {
    const { CapacitorPasskey } = await import('@capgo/capacitor-passkey');
    const result = await CapacitorPasskey.createCredential({
      publicKey: {
        challenge: optionsJSON.challenge,
        rp: optionsJSON.rp,
        user: optionsJSON.user,
        pubKeyCredParams: optionsJSON.pubKeyCredParams,
        timeout: optionsJSON.timeout,
        excludeCredentials: optionsJSON.excludeCredentials?.map((c: any) => ({
          id: c.id,
          type: c.type || 'public-key',
          transports: c.transports,
        })),
        authenticatorSelection: optionsJSON.authenticatorSelection,
        attestation: optionsJSON.attestation,
        extensions: optionsJSON.extensions as Record<string, unknown> | undefined,
      },
    });
    return result as unknown as RegistrationResponseJSON;
  }

  const { startRegistration } = await import('@simplewebauthn/browser');
  return startRegistration({ optionsJSON });
}
