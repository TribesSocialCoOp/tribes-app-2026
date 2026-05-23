"use client";

/**
 * @fileoverview Global Passkey Shim Initializer
 *
 * Installs the @capgo/capacitor-passkey WebAuthn shim on native platforms,
 * then patches the shimmed navigator.credentials.get/create so the returned
 * objects satisfy @simplewebauthn/browser's expectations.
 *
 * Problem: The Capacitor shim returns plain JS objects from navigator.credentials.get(),
 * but @simplewebauthn/browser calls credential.getClientExtensionResults() on the response.
 * Plain objects don't have this method → "Can only call PublicKeyCredential.getClientExtensionResults
 * on instances of PublicKeyCredential".
 *
 * Fix: After the shim installs, wrap navigator.credentials.get/create to add the missing
 * method to the response if it's absent.
 *
 * This MUST be mounted in the ROOT layout so the shim is available on the login page
 * BEFORE the user attempts passkey authentication.
 */

import { useEffect } from 'react';
import { isNative } from '@/lib/capacitor/platform';

/**
 * Patches navigator.credentials.get and .create so that the returned credential
 * has a getClientExtensionResults() method (which the Capacitor shim omits).
 * Also ensures authenticatorAttachment is present.
 */
function patchCredentialsApi() {
  if (!navigator.credentials) return;

  const originalGet = navigator.credentials.get.bind(navigator.credentials);
  const originalCreate = navigator.credentials.create.bind(navigator.credentials);

  navigator.credentials.get = async function (options?: CredentialRequestOptions) {
    const credential = await originalGet(options);
    return patchCredential(credential);
  };

  navigator.credentials.create = async function (options?: CredentialCreationOptions) {
    const credential = await originalCreate(options);
    return patchCredential(credential);
  };

  console.log('[passkey-shim] Patched navigator.credentials.get/create for @simplewebauthn compatibility');
}

function patchCredential<T extends Credential | null>(credential: T): T {
  if (!credential) return credential;

  // Add getClientExtensionResults if missing (Capacitor shim returns plain objects)
  if (!('getClientExtensionResults' in credential) || typeof (credential as any).getClientExtensionResults !== 'function') {
    (credential as any).getClientExtensionResults = function () {
      // Return the clientExtensionResults property if it exists, or empty object
      return (credential as any).clientExtensionResults || {};
    };
  }

  // Ensure authenticatorAttachment is present (some shims omit it)
  if (!('authenticatorAttachment' in credential)) {
    (credential as any).authenticatorAttachment = 'platform';
  }

  return credential;
}

export function PasskeyShimInitializer() {
  useEffect(() => {
    if (!isNative) return;

    const cap = (window as any).Capacitor;
    const platformName = cap?.getPlatform?.();
    if (platformName === 'android' || platformName === 'ios') {
      import('@capgo/capacitor-passkey')
        .then(async ({ CapacitorPasskey }) => {
          console.log(`[passkey-shim] Installing WebAuthn shim for ${platformName} (root layout)`);
          await CapacitorPasskey.autoShimWebAuthn();
          console.log(`[passkey-shim] WebAuthn shim installed successfully`);

          // Patch the shimmed credentials API to add missing methods
          // that @simplewebauthn/browser expects
          patchCredentialsApi();
        })
        .catch(err => {
          console.error('[passkey-shim] Failed to install WebAuthn shim:', err);
        });
    }
  }, []);

  return null;
}
