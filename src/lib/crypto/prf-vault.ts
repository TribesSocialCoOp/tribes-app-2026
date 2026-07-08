/**
 * @fileoverview Passkey PRF-based vault recovery.
 * Phase 3: Hardware-backed multi-device key sync.
 *
 * This module leverages the WebAuthn PRF (Pseudo-Random Function) extension
 * to derive a deterministic wrapping key from the user's passkey. This key
 * wraps the local keystore (bond keys + journal key) for backup and restore.
 *
 * Security:
 * - Wrapping key is derived via HKDF from the hardware-backed PRF output.
 * - Wrapping key is non-extractable.
 * - Server only sees the opaque encrypted vault blob.
 *
 * ⚠️ Browser-only module.
 */

import {
  exportPrivateKey,
  importPrivateKey,
} from './key-manager';
import {
  getAllBondKeys,
  getBondKey,
  storeBondKey,
  deleteSharedSecret,
  hashPublicKeyJwk,
  getAllTribeKeys,
  storeTribeKey,
  getTribeKey,
} from './key-store';
import type { VaultEntry, VaultPayload, TribeKeyVaultEntry } from './vault-types';

// ============================================================
// CONSTANTS
// ============================================================

const VAULT_VERSION = 2;
const PRF_SALT = 'tribes.app/prf-vault/v1';
const HKDF_INFO = 'tribes.app/prf-vault-wrapping-key/v1';

// ============================================================
// DETECTION & CAPABILITIES
// ============================================================

/**
 * localStorage flag: set once a PRF ceremony has actually derived a wrapping
 * key on this device (see markPrfProven, called from the login flow). This is
 * ground truth — a device where PRF demonstrably worked supports PRF, full stop.
 */
const PRF_PROVEN_KEY = 'tribes:prf-proven-v1';

/**
 * Records that the PRF extension successfully produced a usable output on this
 * device/origin. Called from the login flow right after the wrapping key is
 * derived. Persisted so isPrfSupported() reports the truth even when the
 * platform's capability probe lies (see the iOS note in isPrfSupported).
 */
export function markPrfProven(): void {
  try { localStorage.setItem(PRF_PROVEN_KEY, '1'); } catch { /* private mode / unavailable */ }
}

function isPrfProven(): boolean {
  try { return localStorage.getItem(PRF_PROVEN_KEY) === '1'; } catch { return false; }
}

/**
 * Checks if the browser/platform supports the WebAuthn PRF extension.
 *
 * Detection strategy (first match wins):
 * 0. Proven: a PRF ceremony has already derived a wrapping key on this device.
 * 1. Standard: PublicKeyCredential.getClientCapabilities() (WebAuthn L3) —
 *    trusted ONLY for a positive result (see the iOS caveat below).
 * 2. Native iOS (Capacitor): PRF is supported via the system authenticator
 *    (iCloud Keychain / Face ID). The login flow already uses this successfully.
 * 3. Fallback: If navigator.credentials is available and we're on a platform
 *    known to support passkeys, assume PRF is available — the actual PRF result
 *    is validated at ceremony time anyway.
 */
export async function isPrfSupported(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    console.log('[prf] No window or PublicKeyCredential');
    return false;
  }

  // 0. Ground truth: if PRF has ever derived a wrapping key here, it's supported
  // — regardless of what any capability probe claims.
  if (isPrfProven()) {
    console.log('[prf] PRF previously proven on this device — supported');
    return true;
  }

  // 1. Check getClientCapabilities (Standard way, WebAuthn L3)
  // This API is new and not yet in all TypeScript lib definitions — use safe dynamic access.
  const pkc = PublicKeyCredential as unknown as Record<string, unknown>;
  if (typeof pkc.getClientCapabilities === 'function') {
    try {
      const caps = await (pkc.getClientCapabilities as () => Promise<Record<string, boolean>>)();
      console.log('[prf] getClientCapabilities:', caps);
      // Chrome reports PRF as 'extension:prf', Safari/standard as 'prf'.
      // Trust this ONLY for a positive: iOS 18 WebKit supports PRF at ceremony
      // time but OMITS `prf` from this map, so a missing key is INCONCLUSIVE —
      // fall through to the platform heuristics below instead of returning false.
      if (caps.prf || caps['extension:prf']) return true;
      console.log('[prf] getClientCapabilities did not advertise prf — inconclusive, continuing');
    } catch (err) {
      console.log('[prf] getClientCapabilities threw:', err);
      // Fall through — capability check failed (e.g., browser throws on unknown caps)
    }
  } else {
    console.log('[prf] getClientCapabilities not available');
  }

  // 2. Native (Capacitor): ask the passkey plugin whether THIS binary's native
  // bridge supports PRF. Older plugin builds dropped WebAuthn extensions
  // entirely (hardcoded empty clientExtensionResults), so "iOS supports PRF"
  // was never enough — the bridge itself has to forward it. Our patched plugin
  // reports `prf: true` from isSupported() (iOS 18+); older builds omit the
  // field and correctly resolve to false, steering users to passphrase restore.
  const cap = (window as unknown as Record<string, any>).Capacitor;
  console.log('[prf] Capacitor global:', !!cap, 'isNative:', cap?.isNativePlatform?.(), 'platform:', cap?.getPlatform?.());
  if (cap?.isNativePlatform?.()) {
    try {
      const { CapacitorPasskey } = await import('@capgo/capacitor-passkey');
      const support = await CapacitorPasskey.isSupported();
      console.log('[prf] native plugin isSupported:', support);
      return (support as { prf?: boolean }).prf === true;
    } catch (err) {
      console.log('[prf] native plugin isSupported threw:', err);
      return false;
    }
  }

  // 3. Web fallback: check if we're on a modern platform with credentials support.
  // Safari 18+, Chrome 128+, and other modern browsers support PRF — but without
  // getClientCapabilities we can't be 100% sure. We optimistically return true
  // if the platform has PublicKeyCredential + conditional mediation support
  // (a proxy for "modern enough for PRF"). The actual PRF result is validated
  // at ceremony time and we handle failures gracefully.
  if (typeof pkc.isConditionalMediationAvailable === 'function') {
    try {
      const hasCM = await (pkc.isConditionalMediationAvailable as () => Promise<boolean>)();
      console.log('[prf] isConditionalMediationAvailable:', hasCM);
      if (hasCM) return true;
    } catch (err) {
      console.log('[prf] isConditionalMediationAvailable threw:', err);
      // Fall through
    }
  } else {
    console.log('[prf] isConditionalMediationAvailable not available');
  }

  // 4. Unknown capability — not supported.
  console.log('[prf] No detection method succeeded — returning false');
  return false;
}

/**
 * Derives a stable 32-byte binary salt for PRF evaluation.
 * Hashes the human-readable label with SHA-256 to produce a fixed-length value
 * that satisfies the WebAuthn PRF extension requirement.
 *
 * This value is used identically on both the server (registration options)
 * and the client (getPrfSaltBytes()) so the same authenticator input is always evaluated.
 */
export async function getPrfSaltBytes(): Promise<Uint8Array> {
  const label = new TextEncoder().encode(PRF_SALT);
  if (typeof crypto === 'undefined' || !crypto.subtle) {
    console.warn('[prf] crypto.subtle is not available (insecure context or unsupported environment)');
    const fallback = new Uint8Array(32);
    for (let i = 0; i < label.length; i++) {
      fallback[i % 32] ^= label[i];
    }
    return fallback;
  }
  const hash = await crypto.subtle.digest('SHA-256', label);
  return new Uint8Array(hash);
}

// ============================================================
// KEY DERIVATION
// ============================================================

/**
 * Normalizes a PRF extension result into a >=32-byte ArrayBuffer, or null.
 *
 * The shape differs across browsers/platforms — this tolerates all of them:
 * - Chrome/Safari (web): `prf.results.first` is a same-realm ArrayBuffer.
 * - Firefox (web): the ArrayBuffer can come from a DIFFERENT JS realm, so
 *   `instanceof ArrayBuffer` is false even though it IS one — we detect it via
 *   `Object.prototype.toString` (realm-safe) and copy it with `new Uint8Array`,
 *   which reads the internal buffer slot regardless of realm.
 * - Native (Capacitor iOS/Android): crosses a JSON bridge → base64url string,
 *   or occasionally an array-like object of byte values.
 *
 * Always returns a fresh, same-realm ArrayBuffer so downstream
 * `crypto.subtle.importKey('raw', ...)` and the `instanceof` guard in
 * derivePrfWrappingKey both succeed.
 */
export function normalizePrfOutput(raw: unknown): ArrayBuffer | null {
  if (raw == null) return null;

  // base64url / base64 string (native bridge)
  if (typeof raw === 'string') {
    try {
      const base64 = raw.replace(/-/g, '+').replace(/_/g, '/');
      const padding = '='.repeat((4 - (base64.length % 4)) % 4);
      const binary = atob(base64 + padding);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.byteLength >= 32 ? (bytes.buffer as ArrayBuffer) : null;
    } catch {
      return null;
    }
  }

  // Typed array / DataView — ArrayBuffer.isView() is realm-safe (internal slot).
  if (ArrayBuffer.isView(raw)) {
    const view = raw as ArrayBufferView;
    if (view.byteLength < 32) return null;
    return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) as ArrayBuffer;
  }

  // ArrayBuffer — including same-realm (instanceof) AND cross-realm (Firefox),
  // where instanceof fails but the toString tag and `new Uint8Array` still work.
  const tag = Object.prototype.toString.call(raw);
  if (raw instanceof ArrayBuffer || tag === '[object ArrayBuffer]' || tag === '[object SharedArrayBuffer]') {
    try {
      const copy = new Uint8Array(raw as ArrayBuffer); // realm-safe read
      return copy.byteLength >= 32 ? copy.slice().buffer : null;
    } catch {
      return null;
    }
  }

  // Array-like object of byte values (defensive — some bridges JSON-ify bytes).
  if (typeof raw === 'object') {
    try {
      const values = Array.isArray(raw) ? raw : Object.values(raw as Record<string, unknown>);
      if (values.length >= 32 && values.every((v) => typeof v === 'number')) {
        return Uint8Array.from(values as number[]).buffer;
      }
    } catch {
      /* fall through */
    }
  }

  return null;
}

/**
 * Derives a non-extractable AES-256-GCM wrapping key from a PRF output.
 *
 * @param prfOutput The 32-byte secret returned by the authenticator's PRF extension.
 */
export async function derivePrfWrappingKey(prfOutput: ArrayBuffer): Promise<CryptoKey> {
  // Validate input is a non-empty ArrayBuffer
  if (!(prfOutput instanceof ArrayBuffer) || prfOutput.byteLength < 32) {
    throw new Error('[prf-vault] Invalid PRF output: expected at least 32-byte ArrayBuffer');
  }

  // 1. Import raw PRF output as key material for HKDF
  const baseKey = await crypto.subtle.importKey(
    'raw',
    prfOutput,
    'HKDF',
    false,
    ['deriveKey']
  );

  // 2. Derive the final AES-GCM key.
  // We include a fixed app-scoped salt for HKDF defense-in-depth, even though
  // the PRF output is already high-entropy. RFC 5869 recommends a non-empty salt.
  const hkdfSalt = new TextEncoder().encode('tribes.app/prf-hkdf-salt/v1');

  return await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: hkdfSalt,
      info: new TextEncoder().encode(HKDF_INFO),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // derived key is non-extractable
    ['encrypt', 'decrypt']
  );
}

// ============================================================
// VAULT OPERATIONS
// ============================================================


/**
 * Encrypts the local keystore into a vault blob using a PRF wrapping key.
 * Exports all bond keys and the personal journal key.
 */
export async function encryptVaultWithPrf(
  wrappingKey: CryptoKey,
  userId?: string,
  credentialId?: string,
): Promise<ArrayBuffer> {
  let storedKeys = await getAllBondKeys();
  if (storedKeys.length === 0) throw new Error('No keys to backup');

  // Pre-flight: ALWAYS merge the existing server vault into the local store
  // before exporting. Without this, a device holding fewer keys would clobber
  // a richer vault saved by another device (the save path is delete+insert).
  // This also self-heals locked (non-extractable) local keys by upgrading them
  // from the vault copy.
  try {
    const { getPrfVaultAction } = await import('@/lib/actions/key-vault-actions');
    const { sessionVaultKey } = await import('./session-vault-key');
    const credId = credentialId ?? sessionVaultKey.get()?.credentialId;
    if (credId) {
      const vaultData = await getPrfVaultAction(credId);
      if (vaultData?.encryptedVaultBase64) {
        const encryptedVault = new Uint8Array(
          Buffer.from(vaultData.encryptedVaultBase64, 'base64')
        ).buffer;
        const merged = await decryptAndRestoreVault(wrappingKey, encryptedVault, userId);
        if (merged.imported > 0) {
          console.log(`[prf-vault] Merged ${merged.imported} key(s) from existing vault before save`);
        }
      }
    }
  } catch (mergeErr) {
    console.warn('[prf-vault] Pre-save merge with existing vault failed (saving local keys only):', mergeErr);
  }
  // Re-read keys after merge
  storedKeys = await getAllBondKeys();

  const entries: VaultEntry[] = [];
  for (const stored of storedKeys) {
    try {
      // Export private key (AES for journal, ECDSA/ECDH for bonds)
      const privateKeyJwk = await exportPrivateKey(stored.privateKey);
      entries.push({
        bondId: stored.bondId,
        privateKeyJwk,
        publicKeyJwk: stored.publicKeyJwk,
        createdAt: stored.createdAt,
      });
    } catch (err) {
      console.warn(`[prf-vault] Skipping non-extractable key for ${stored.bondId}`, err);
    }
  }

  if (entries.length === 0) throw new Error('No exportable keys found');

  const payload: VaultPayload = {
    version: VAULT_VERSION,
    entries,
    exportedAt: Date.now(),
  };

  // Include identity key if available (matches vault-backup.ts v2 format)
  if (userId) {
    try {
      const { getIdentityKey } = await import('./key-store');
      const { exportIdentityPrivateKey } = await import('./identity-keys');
      const identityEntry = await getIdentityKey(userId);
      if (identityEntry) {
        payload.identityKey = {
          privateKeyJwk: await exportIdentityPrivateKey(identityEntry.privateKey),
          publicKeyJwk: identityEntry.publicKeyJwk, // already a JWK — no re-import needed
        };
      }
    } catch (err) {
      console.warn('[prf-vault] Could not include identity key in backup:', err);
    }
  }

  // Include tribe group keys (AES-256-GCM symmetric keys). User-scoped cache, so
  // we need the userId; skip if absent.
  try {
    const tribeKeys = userId ? await getAllTribeKeys(userId) : [];
    if (tribeKeys.length > 0) {
      const tribeKeyEntries: TribeKeyVaultEntry[] = [];
      for (const tk of tribeKeys) {
        try {
          const keyJwk = await crypto.subtle.exportKey('jwk', tk.key);
          tribeKeyEntries.push({
            tribeId: tk.tribeId,
            keyJwk,
            version: tk.version,
          });
        } catch {
          console.warn(`[prf-vault] Skipping non-extractable tribe key for ${tk.tribeId}`);
        }
      }
      if (tribeKeyEntries.length > 0) {
        payload.tribeKeys = tribeKeyEntries;
        console.log(`[prf-vault] Including ${tribeKeyEntries.length} tribe key(s) in backup`);
      }
    }
  } catch (err) {
    console.warn('[prf-vault] Failed to export tribe keys:', err);
  }

  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    plaintext
  );

  // Pack: [IV 12B][Ciphertext]
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv, 0);
  packed.set(new Uint8Array(ciphertext), iv.length);

  return packed.buffer;
}

/**
 * Decrypts a vault blob and restores keys into the local IndexedDB keystore.
 */
export async function decryptAndRestoreVault(
  wrappingKey: CryptoKey,
  encryptedVault: ArrayBuffer,
  userId?: string,
): Promise<{ imported: number; skipped: number; total: number; bondIds: string[] }> {
  const packed = new Uint8Array(encryptedVault);
  if (packed.length < 12) throw new Error('Invalid vault blob');

  const iv = packed.slice(0, 12);
  const ciphertext = packed.slice(12);

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    ciphertext
  );

  const payload: VaultPayload = JSON.parse(new TextDecoder().decode(plaintext));
  if (payload.version !== 1 && payload.version !== VAULT_VERSION) {
    throw new Error(`Unsupported vault version: ${payload.version}`);
  }

  // Resolve key-pair conflicts against the server's published key per bond:
  // the key the server has on record is the one peers derive secrets from,
  // so it is the source of truth when local and vault disagree.
  const serverKeyHashes = new Map<string, string>();
  try {
    const { getBonds } = await import('@/lib/actions/bond-actions');
    const bonds = await getBonds();
    for (const b of bonds) {
      if (b.targetType === 'user' && b.publicKeyJwk) {
        try {
          serverKeyHashes.set(b.id, await hashPublicKeyJwk(JSON.parse(b.publicKeyJwk)));
        } catch { /* unparseable server key — ignore */ }
      }
    }
  } catch (err) {
    console.warn('[prf-vault] Could not fetch server keys for merge resolution (defaulting to local-wins):', err);
  }

  // Smart merge:
  // - New bonds: import directly
  // - Same public key: skip (already in sync)
  // - Different public key: whichever side matches the server's published key wins
  let imported = 0;
  let skipped = 0;

  for (const entry of payload.entries) {
    try {
      const existingKey = await getBondKey(entry.bondId);

      if (existingKey) {
        // Compare public key hashes to detect key pair changes
        const localPubHash = await hashPublicKeyJwk(existingKey.publicKeyJwk);
        const backupPubHash = await hashPublicKeyJwk(entry.publicKeyJwk);

        if (localPubHash === backupPubHash && existingKey.privateKey.extractable) {
          // Same key pair AND extractable — no action needed
          skipped++;
          continue;
        }

        if (localPubHash !== backupPubHash) {
          const serverHash = serverKeyHashes.get(entry.bondId);

          if (serverHash && serverHash === backupPubHash && serverHash !== localPubHash) {
            // The vault's key matches the server record and the local one
            // doesn't — the local key is the orphan. Vault wins; the cached
            // shared secret was derived from the wrong pair, so drop it.
            console.warn(
              `[prf-vault] Bond ${entry.bondId.substring(0, 16)}... local key doesn't match server — ` +
              `restoring vault key (server: ${serverHash.substring(0, 8)}...)`
            );
            await deleteSharedSecret(entry.bondId);
            // Fall through to import below
          } else {
            // Local matches the server (or the server key is unknown) — keep local.
            console.warn(
              `[prf-vault] Bond ${entry.bondId.substring(0, 16)}... has different local key — ` +
              `keeping local (local: ${localPubHash.substring(0, 8)}... backup: ${backupPubHash.substring(0, 8)}...)`
            );
            skipped++;
            continue;
          }
        }

        if (localPubHash === backupPubHash) {
          // Same key but non-extractable (locked) — overwrite to unlock.
          // This enables vault backup from this device.
          console.log(
            `[prf-vault] Bond ${entry.bondId.substring(0, 16)}... is locked — upgrading to extractable`
          );
        }
        // Fall through to import below
      }

      const key = await importPrivateKey(entry.privateKeyJwk);
      await storeBondKey(entry.bondId, key, entry.publicKeyJwk);
      imported++;
    } catch (err) {
      console.error(`[prf-vault] Failed to restore key for ${entry.bondId}`, err);
    }
  }

  // Restore identity key if present.
  // Overwrite if missing OR if the local key is non-extractable (locked),
  // same pattern as bond key restore — see dev-post-multi-device-key-sync.md.
  if (payload.identityKey && userId) {
    try {
      const { importIdentityPrivateKey } = await import('./identity-keys');
      const { storeIdentityKey, getIdentityKey } = await import('./key-store');

      const existingIdentity = await getIdentityKey(userId);
      const isLocked = existingIdentity && !existingIdentity.privateKey.extractable;

      if (!existingIdentity || isLocked) {
        const privateKey = await importIdentityPrivateKey(payload.identityKey.privateKeyJwk);
        await storeIdentityKey(userId, privateKey, payload.identityKey.publicKeyJwk);
        console.log(`[prf-vault] ${isLocked ? 'Upgraded locked' : 'Restored'} identity key for user ${userId.substring(0, 8)}...`);
      } else {
        console.debug(`[prf-vault] Skipping identity key — local key exists and is extractable for ${userId.substring(0, 8)}...`);
      }
    } catch (err) {
      console.warn('[prf-vault] Failed to restore identity key:', err);
    }
  }

  // Restore tribe group keys if present (v2+). User-scoped cache → needs userId.
  if (payload.tribeKeys && payload.tribeKeys.length > 0) {
    if (!userId) {
      console.warn('[prf-vault] Skipping tribe key restore — no userId provided for user-scoped cache');
    } else {
      let tribeRestored = 0;
      for (const tkEntry of payload.tribeKeys) {
        try {
          const existing = await getTribeKey(userId, tkEntry.tribeId);
          if (existing && existing.version >= tkEntry.version) {
            continue;
          }

          const tribeKey = await crypto.subtle.importKey(
            'jwk',
            tkEntry.keyJwk,
            { name: 'AES-GCM', length: 256 },
            true,
            ['encrypt', 'decrypt'],
          );
          await storeTribeKey(userId, tkEntry.tribeId, tribeKey, tkEntry.version);
          tribeRestored++;
        } catch (err) {
          console.warn(`[prf-vault] Failed to restore tribe key for ${tkEntry.tribeId}:`, err);
        }
      }
      if (tribeRestored > 0) {
        console.log(`[prf-vault] Restored ${tribeRestored} tribe key(s) from backup`);
      }
    }
  }

  console.log(`[prf-vault] Restore complete: ${imported} imported, ${skipped} unchanged, ${payload.entries.length} total`);

  return {
    imported,
    skipped,
    total: payload.entries.length,
    bondIds: payload.entries.map(e => e.bondId),
  };
}
