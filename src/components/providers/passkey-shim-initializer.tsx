"use client";

/**
 * @fileoverview Global Passkey Shim Initializer
 *
 * Installs the @capgo/capacitor-passkey WebAuthn shim on native platforms.
 * This MUST be mounted in the ROOT layout (not the (app) layout) so the shim
 * is available on the login page BEFORE the user attempts passkey authentication.
 *
 * Previously this was only in NativeInitializer (inside (app) layout), which meant
 * the shim was never installed when the user was on the (auth) login page — causing
 * startAuthentication() to fail on iOS because the unshimmed WKWebView WebAuthn
 * response format doesn't match what @simplewebauthn/browser expects.
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
