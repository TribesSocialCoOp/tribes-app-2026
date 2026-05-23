"use client";

/**
 * @fileoverview Global Passkey Shim Initializer
 *
 * Installs the @capgo/capacitor-passkey WebAuthn shim on native platforms.
 * This MUST be mounted in the ROOT layout (not the (app) layout) so the shim
 * is available on the login page BEFORE the user attempts passkey authentication.
 *
 * NOTE: The login and signup pages use CapacitorPasskey.getCredential() and
 * .createCredential() directly on native, bypassing @simplewebauthn/browser
 * entirely. The shim is still installed for any other code that may call
 * navigator.credentials.get/create (e.g. conditional UI, autofill).
 */

import { useEffect } from 'react';
import { isNative } from '@/lib/capacitor/platform';

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
        })
        .catch(err => {
          console.error('[passkey-shim] Failed to install WebAuthn shim:', err);
        });
    }
  }, []);

  return null;
}
