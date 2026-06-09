/**
 * @fileoverview Module-level session vault key store.
 *
 * Holds a PRF-derived wrapping key in memory for the duration of the session.
 * Set at login when PRF output is available. Cleared on page unload (GC'd automatically).
 * Used by KeySyncProvider to silently save an updated vault whenever new keys are generated.
 *
 * Zero extra user prompts — the wrapping key is derived from the authenticator once at
 * login and kept non-extractable in the Web Crypto key object.
 */

type SessionVaultKey = {
  credentialId: string;
  /** Non-extractable AES-256-GCM key — lives only in memory, GC'd on unload */
  wrappingKey: CryptoKey;
};

let _key: SessionVaultKey | null = null;

export const sessionVaultKey = {
  set(credentialId: string, wrappingKey: CryptoKey) {
    _key = { credentialId, wrappingKey };
  },
  get(): SessionVaultKey | null {
    return _key;
  },
  clear() {
    _key = null;
  },
};
