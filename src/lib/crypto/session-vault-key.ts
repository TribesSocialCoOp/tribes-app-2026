/**
 * @fileoverview Session vault key store with IndexedDB persistence.
 *
 * Holds the PRF-derived wrapping key used to encrypt/decrypt the user's
 * passkey vault. Set at login (or any manual passkey ceremony) when PRF
 * output is available, and persisted to IndexedDB (as a non-extractable
 * CryptoKey handle) so background vault auto-sync keeps working across
 * page reloads and app restarts without another passkey ceremony.
 *
 * The persisted key is scoped to a userId — on a shared browser it is never
 * hydrated for a different logged-in user.
 *
 * Zero extra user prompts — the wrapping key is derived from the authenticator
 * once and remains non-extractable in the Web Crypto key object.
 */

type SessionVaultKey = {
  credentialId: string;
  /** Non-extractable AES-256-GCM key */
  wrappingKey: CryptoKey;
  /**
   * Owner of this key. The in-memory copy must NEVER be served to a different
   * logged-in user — on a shared browser, A logging out then B logging in (an
   * SPA transition keeps module state alive) must not hand B user A's key.
   */
  userId?: string;
};

let _key: SessionVaultKey | null = null;
let _loadAttemptedFor: string | null = null;

/**
 * Returns the in-memory key only if it is safe to serve to `forUserId`.
 * A key whose owner is known and differs from the requester is discarded
 * (and the hydrate-once guard reset) so the correct user re-hydrates.
 */
function memoryKeyFor(forUserId?: string): SessionVaultKey | null {
  if (!_key) return null;
  if (_key.userId && forUserId && _key.userId !== forUserId) {
    // Stale key from a previous login on this page session — drop it.
    _key = null;
    _loadAttemptedFor = null;
    return null;
  }
  return _key;
}

export const sessionVaultKey = {
  set(credentialId: string, wrappingKey: CryptoKey, userId?: string) {
    _key = { credentialId, wrappingKey, userId };
    if (userId) _loadAttemptedFor = userId;
    if (!userId) return; // can't scope persistence safely — keep in memory only
    // Persist asynchronously so future sessions can auto-sync without re-auth.
    // Fire-and-forget: persistence failing only means sync stops at next reload.
    import('./key-store')
      .then(({ storeVaultWrappingKey }) => storeVaultWrappingKey(credentialId, wrappingKey, userId))
      .catch((err) => console.warn('[session-vault-key] Failed to persist wrapping key:', err));
  },
  get(): SessionVaultKey | null {
    return _key;
  },
  /**
   * Returns the in-memory key (scoped to userId), falling back to the persisted
   * copy in IndexedDB belonging to the given user (hydrated once per userId).
   */
  async load(userId?: string): Promise<SessionVaultKey | null> {
    const inMemory = memoryKeyFor(userId);
    if (inMemory) return inMemory;
    if (!userId || _loadAttemptedFor === userId) return null;
    _loadAttemptedFor = userId;
    try {
      const { getVaultWrappingKey } = await import('./key-store');
      const stored = await getVaultWrappingKey(userId);
      if (stored) {
        _key = { credentialId: stored.credentialId, wrappingKey: stored.wrappingKey, userId };
        console.debug('[session-vault-key] Hydrated wrapping key from IndexedDB');
      }
    } catch (err) {
      console.warn('[session-vault-key] Failed to hydrate wrapping key:', err);
    }
    return memoryKeyFor(userId);
  },
  /** Clears the in-memory key only (e.g., on logout). Leaves persisted,
   *  userId-scoped copies in IndexedDB intact for fast re-login auto-sync. */
  clearMemory() {
    _key = null;
    _loadAttemptedFor = null;
  },
  clear() {
    _key = null;
    _loadAttemptedFor = null;
    import('./key-store')
      .then(({ clearVaultWrappingKeys }) => clearVaultWrappingKeys())
      .catch(() => { /* non-critical */ });
  },
};
