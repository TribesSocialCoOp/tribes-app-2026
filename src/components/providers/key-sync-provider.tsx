'use client';

/**
 * @fileoverview Background Key Sync Provider.
 *
 * Runs on app mount inside the authenticated layout. Handles all
 * client-side cryptographic key lifecycle management:
 *
 * Phase 0: Generate RSA-OAEP identity key pair (for tribe key distribution)
 * Phase A: Generate ECDH key pairs for bonds, derive shared secrets (for DMs)
 * Phase B: Fetch and unwrap incoming tribe key grants (using RSA private key)
 * Phase C: Generate tribe keys and distribute to members (using RSA public keys)
 *
 * Runs periodically with adaptive intervals:
 * - Fast (15s) for the first 2 minutes after mount or manual trigger
 * - Relaxed (60s) thereafter
 * - Pauses entirely when the tab is hidden; resumes on focus
 *
 * Key separation of concerns:
 * - ECDH (P-256) is used for personal bonds (1:1 DM encryption)
 * - RSA-OAEP (4096-bit) is used for tribe key distribution (group encryption)
 * - These two systems share zero code paths
 */

import React, { useEffect, useRef, useCallback, createContext, useContext, useState } from 'react';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// CONTEXT — Exposes sync status to consumers
// ============================================================

interface KeySyncState {
  /** Number of bonds with completed key exchange (shared secret available) */
  readyBondCount: number;
  /** Total number of user-type bonds */
  totalBondCount: number;
  /** Number of bonds that have server-side keys but no local key (need vault restore or re-key) */
  orphanedBondCount: number;
  /** Names of bonds that are orphaned (for display in the banner) */
  orphanedBondNames: string[];
  /** The most recent date an orphaned bond key was created (used to check backup freshness) */
  newestOrphanDate: Date | null;
  /** The most recent date a HEALTHY local bond key was pushed to the server */
  newestKeyDate: Date | null;
  /** Number of private tribes with a locally cached group key */
  tribeKeysReady: number;
  /** Whether the initial sync has completed at least once */
  initialSyncDone: boolean;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /**
   * Whether PRF passkey vault auto-sync is active this session — the
   * wrapping key is available and the last vault pull succeeded. When true,
   * manual backup warnings are unnecessary: keys flow to/from the vault
   * automatically.
   */
  prfSyncActive: boolean;
  /**
   * True when this device has pending tribe-key grant(s) it CANNOT unwrap because
   * it holds no usable RSA identity private key (e.g. a new device/profile that
   * lost the publish race and never restored its vault). The fix is a vault
   * restore — surfaced so the UI can tell the user instead of spinning forever.
   */
  tribeKeyRestoreNeeded: boolean;
  /** Trigger an immediate sync (e.g., after accepting a bond) */
  triggerSync: () => void;
  /** Re-generate keys for bonds stuck without local keys. Old posts encrypted with previous keys will be unreadable. */
  rekeyOrphanedBonds: () => Promise<void>;
}

const KeySyncContext = createContext<KeySyncState>({
  readyBondCount: 0,
  totalBondCount: 0,
  orphanedBondCount: 0,
  orphanedBondNames: [],
  newestOrphanDate: null,
  newestKeyDate: null,
  tribeKeysReady: 0,
  initialSyncDone: false,
  isSyncing: false,
  prfSyncActive: false,
  tribeKeyRestoreNeeded: false,
  triggerSync: () => { },
  rekeyOrphanedBonds: async () => { },
});

export const useKeySync = () => useContext(KeySyncContext);

import { detectCurrentDeviceLabel } from '@/lib/utils/device';

// ============================================================
// PROVIDER COMPONENT
// ============================================================

export function KeySyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const { toast } = useToast();
  const syncLock = useRef(false);
  const syncLockAt = useRef(0); // when the lock was taken (ms) — watchdog against a hung cycle
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasVaultBeenSavedRef = useRef(false);
  const vaultPushPendingRef = useRef(false);

  const [readyBondCount, setReadyBondCount] = useState(0);
  const [totalBondCount, setTotalBondCount] = useState(0);
  const [orphanedBondCount, setOrphanedBondCount] = useState(0);
  const [orphanedBondNames, setOrphanedBondNames] = useState<string[]>([]);
  const [newestOrphanDate, setNewestOrphanDate] = useState<Date | null>(null);
  const [newestKeyDate, setNewestKeyDate] = useState<Date | null>(null);
  const [tribeKeysReady, setTribeKeysReady] = useState(0);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [prfSyncActive, setPrfSyncActive] = useState(false);
  const [tribeKeyRestoreNeeded, setTribeKeyRestoreNeeded] = useState(false);

  /**
   * Silently saves an updated PRF vault (merging with the server copy first).
   * No-op if no wrapping key is available (no PRF this session/device).
   */
  const maybeSaveVault = useCallback(async (shouldSave: boolean) => {
    if (!shouldSave) return;

    try {
      const { sessionVaultKey, encryptVaultWithPrf, prfDebug } = await import('@/lib/crypto');
      const { savePrfVaultAction } = await import('@/lib/actions/key-vault-actions');

      const session = await sessionVaultKey.load(user?.id);
      if (!session) {
        prfDebug('sync.save.noWrappingKey', { note: 'Wanted to push vault but no PRF wrapping key on this device.' });
        return; // PRF not available on this device
      }

      const encrypted = await encryptVaultWithPrf(session.wrappingKey, user?.id, session.credentialId);
      const b64 = Buffer.from(encrypted).toString('base64');
      const isFirstSave = !hasVaultBeenSavedRef.current;

      await savePrfVaultAction(b64, session.credentialId);
      hasVaultBeenSavedRef.current = true;
      vaultPushPendingRef.current = false;
      prfDebug('sync.save.ok', { credentialIdPrefix: session.credentialId.slice(0, 10), bytes: b64.length, firstSave: isFirstSave });

      if (isFirstSave) {
        toast({
          title: 'Key Sync Enabled',
          description: 'Your encryption keys are automatically backed up to your passkey.',
        });
      }
      console.debug('[key-sync] Vault auto-saved to PRF credential');
    } catch (err) {
      console.warn('[key-sync] Vault auto-save failed (non-fatal):', err);
      try {
        const { prfDebug } = await import('@/lib/crypto');
        prfDebug('sync.save.failed', { error: err instanceof Error ? err.message : String(err) });
      } catch { /* ignore */ }
      // Retry on the next sync cycle — the "vault unchanged" pull marker
      // would otherwise suppress the counter-sync check until new keys appear.
      vaultPushPendingRef.current = true;
      // Silent failure — passphrase backup in Settings still works
    }
  }, [toast, user?.id]);

  /**
   * Pulls the PRF vault from the server and merges any keys this device is
   * missing (newest server copy wins on conflicts that match the server's
   * published bond key). Decryption is skipped when the vault's updatedAt
   * hasn't changed since the last pull on this device.
   *
   * Returns:
   * - active: a wrapping key is available and the pull didn't fail
   * - vaultBondIds: bond ids in the vault when it was decrypted this cycle,
   *   or null when the vault was unchanged (no counter-sync check needed)
   */
  const pullPrfVault = useCallback(async (): Promise<{
    active: boolean;
    vaultBondIds: Set<string> | null;
  }> => {
    // Resolve the session up front so a transient pull/network error below
    // doesn't incorrectly report sync as inactive (which would un-suppress the
    // manual-backup warnings) — having a wrapping key IS what "active" means.
    let haveSession = false;
    try {
      const { sessionVaultKey, decryptAndRestoreVault, prfDebug } = await import('@/lib/crypto');
      const session = await sessionVaultKey.load(user?.id);
      if (!session) {
        prfDebug('sync.pull.noWrappingKey', { note: 'No PRF wrapping key on this device — auto-sync inactive (login with a PRF-capable passkey to enable).' });
        return { active: false, vaultBondIds: null };
      }
      haveSession = true;

      const { getPrfVaultAction } = await import('@/lib/actions/key-vault-actions');
      const vault = await getPrfVaultAction(session.credentialId);
      if (!vault) {
        // No vault yet — still active; the push side will create it.
        prfDebug('sync.pull.noVault', { credentialIdPrefix: session.credentialId.slice(0, 10), note: 'No PRF vault on server for THIS credential. If your other device used a different passkey, its vault is separate and cannot be pulled here.' });
        return { active: true, vaultBondIds: new Set() };
      }

      const markerKey = `tribes:prf-vault-pulled:${session.credentialId}`;
      let lastPulled: string | null = null;
      try { lastPulled = localStorage.getItem(markerKey); } catch { /* private mode */ }
      if (lastPulled === vault.updatedAt) {
        prfDebug('sync.pull.unchanged', { vaultUpdatedAt: vault.updatedAt });
        return { active: true, vaultBondIds: null }; // unchanged since last pull
      }

      const raw = Buffer.from(vault.encryptedVaultBase64, 'base64');
      const encrypted = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
      const result = await decryptAndRestoreVault(session.wrappingKey, encrypted, user?.id);

      try { localStorage.setItem(markerKey, vault.updatedAt); } catch { /* private mode */ }
      prfDebug('sync.pull.merged', { vaultUpdatedAt: vault.updatedAt, imported: result.imported, skipped: result.skipped, total: result.total });

      if (result.imported > 0) {
        console.log(`[key-sync] Auto-pulled ${result.imported} key(s) from passkey vault`);
        toast({
          title: 'Keys Synced',
          description: `${result.imported} encryption key${result.imported !== 1 ? 's' : ''} synced from your other devices.`,
        });
      }

      return { active: true, vaultBondIds: new Set(result.bondIds) };
    } catch (err) {
      console.warn('[key-sync] PRF vault auto-pull failed (non-fatal):', err);
      // A wrapping key exists — sync is still "active", this pull just failed.
      // Returning null vaultBondIds skips the counter-sync check this cycle.
      return { active: haveSession, vaultBondIds: null };
    }
  }, [toast, user?.id]);

  /**
   * Core sync function. Runs all four phases:
   * 0. Initialize RSA identity key pair (one-time per device)
   * 1. Generate ECDH key pairs and derive shared secrets for bonds (DMs)
   * 2. Fetch and unwrap tribe key grants using RSA private key
   * 3. Generate and distribute tribe keys to members using RSA public keys
   */
  const performSync = useCallback(async () => {
    if (!user?.id) return;
    // Watchdog: normally the lock is released in finally, but if a cycle ever
    // wedges on a hung await, don't let it block sync forever — allow a new run
    // after 90s so tribe-key distribution can recover.
    if (syncLock.current && Date.now() - syncLockAt.current < 90_000) return;
    syncLock.current = true;
    syncLockAt.current = Date.now();
    setIsSyncing(true);
    let newKeysGenerated = false;

    try {
      const {
        isCryptoAvailable,
        isKeyStoreAvailable,
        generateExportableBondKeyPair,
        exportPublicKey,
        importPublicKey,
        deriveSharedSecret,
      } = await import('@/lib/crypto');

      const {
        generateIdentityKeyPair,
        exportIdentityPublicKey,
        importIdentityPublicKey,
        wrapKeyForRecipient,
        unwrapKeyFromGrant,
      } = await import('@/lib/crypto/identity-keys');

      const {
        storeBondKey,
        getBondKey,
        storeSharedSecret,
        getSharedSecret,
        markSharedSecretHistorical,
        deleteSharedSecret,
        getAllSharedSecrets,
        hashPublicKeyJwk,
        storeTribeKey,
        getTribeKey,
        storeIdentityKey,
        getIdentityKey,
      } = await import('@/lib/crypto/key-store');

      const { cachePeerKeyHistory } = await import('@/lib/crypto/key-rotation');

      const { getBonds, submitBondPublicKey } = await import('@/lib/actions/bond-actions');
      const { publishEncryptionPublicKey } = await import('@/lib/actions/identity-key-actions');

      // Feature detection
      if (!isCryptoAvailable() || !isKeyStoreAvailable()) {
        console.warn('[key-sync] Crypto or IndexedDB not available, skipping');
        return;
      }

      // ========================================
      // PHASE V: PRF vault auto-pull
      // ========================================
      // Merge keys created on other devices BEFORE the generative phases run,
      // so orphaned bonds heal automatically and we never generate a competing
      // identity key when the vault already holds one.

      // PHASE ISOLATION (WS-1): each phase runs in its own try/catch so a failure
      // in an early phase (vault pull, identity, bonds) can NEVER abort the later
      // tribe-key phases (B: pull grants, C: distribute). Previously an unhandled
      // throw here silently starved tribe-key distribution. Failures are surfaced
      // (warn) instead of swallowed at debug level.
      let vaultSync: { active: boolean; vaultBondIds: Set<string> | null } = { active: false, vaultBondIds: null };
      try {
        vaultSync = await pullPrfVault();
        setPrfSyncActive(vaultSync.active);
      } catch (err) {
        console.warn('[key-sync] Phase V (vault auto-pull) failed (non-fatal; later phases continue):', err);
      }

      // ========================================
      // PHASE 0: Identity Key Initialization
      // ========================================
      // Ensure this browser has an RSA identity key pair for tribe key distribution.

      let identityKey: Awaited<ReturnType<typeof getIdentityKey>> | null = null;
      try {
        identityKey = await getIdentityKey(user.id);
        if (!identityKey) {
          console.debug('[key-sync] Generating new RSA identity key pair...');
          const keyPair = await generateIdentityKeyPair();
          const publicKeyJwk = await exportIdentityPublicKey(keyPair.publicKey);

          const identityResult = await publishEncryptionPublicKey(publicKeyJwk);

          if (identityResult.accepted) {
            // We won the race — store our key
            await storeIdentityKey(user.id, keyPair.privateKey, publicKeyJwk);
            identityKey = await getIdentityKey(user.id);
            newKeysGenerated = true;
            console.debug('[key-sync] Published RSA identity public key to server');
          } else {
            // Another device already published — DON'T store the locally generated key.
            // Vault restore is needed to recover the identity private key from the other device.
            console.warn(
              '[key-sync] Identity key already published by another device. ' +
              'Vault restore needed for tribe key operations.'
            );
            // identityKey remains null — tribe key operations will be skipped this cycle
          }
        }
      } catch (err) {
        console.warn('[key-sync] Phase 0 (identity key) failed (non-fatal; later phases continue):', err);
      }

      // ========================================
      // PHASE 0.5: Device Key Registration
      // ========================================
      // Register this device's identity key in user_device_keys for
      // per-device tribe key grant targeting. This is an ADDITIVE overlay
      // on top of the existing single-identity model.

      let currentDeviceKeyId: string | null = null;

      if (identityKey) {
        try {
          const { registerDeviceKeyAction } = await import('@/lib/actions/device-key-actions');

          // Compute a fingerprint for dedup (same key = same device)
          const pubKeyJson = JSON.stringify(identityKey.publicKeyJwk);
          const fingerprintBuffer = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(pubKeyJson)
          );
          const fingerprint = Array.from(new Uint8Array(fingerprintBuffer))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

          // Auto-detect device label from User-Agent
          const deviceLabel = detectCurrentDeviceLabel();

          const result = await registerDeviceKeyAction(deviceLabel, pubKeyJson, fingerprint);
          currentDeviceKeyId = result.deviceKeyId;

          // Persist fingerprint to localStorage for the "This device" badge in settings
          try { localStorage.setItem('tribes:current-device-fingerprint', fingerprint); } catch { /* non-critical */ }

          if (result.isNew) {
            console.debug(`[key-sync] Registered new device: ${deviceLabel} (${result.deviceKeyId.substring(0, 12)}...)`);
          } else {
            console.debug(`[key-sync] Device already registered, updated lastSeenAt (${result.deviceKeyId.substring(0, 12)}...)`);
          }
        } catch (err) {
          // Non-fatal: device registration failing doesn't block the rest of sync.
          // Legacy grants (deviceKeyId = NULL) will still work.
          console.warn('[key-sync] Device key registration failed (non-fatal):', err);
        }
      }

      // ========================================
      // ONE-TIME MIGRATION: Clear stale shared secrets
      // ========================================
      // V1 cache only stored peerKeyHash; V2 also stores localKeyHash.
      // Clearing forces re-derivation from current key pairs, self-healing
      // any stale secrets caused by local key regeneration.
      const CACHE_VERSION_KEY = 'tribes_shared_secret_cache_v';
      const CURRENT_CACHE_VERSION = '2';

      if (typeof localStorage !== 'undefined' && localStorage.getItem(CACHE_VERSION_KEY) !== CURRENT_CACHE_VERSION) {
        try {
          const staleSecrets = await getAllSharedSecrets();
          for (const s of staleSecrets) {
            await deleteSharedSecret(s.bondId);
          }
          localStorage.setItem(CACHE_VERSION_KEY, CURRENT_CACHE_VERSION);
          console.log(`[key-sync] Cleared ${staleSecrets.length} stale shared secrets (cache format upgrade v1->v2)`);
        } catch (migrationErr) {
          console.warn('[key-sync] Failed to clear stale shared secrets:', migrationErr);
        }
      }

      // ========================================
      // ONE-TIME MIGRATION: Forward-migrate broken bond keys
      // ========================================
      // DISABLED — This migration was running per-device (localStorage flag),
      // which meant every new browser/device that opened the app would wipe
      // all server-side bond keys and regenerate, clobbering the keys that
      // the previous device had submitted. The root cause (refreshBond and
      // toggleInnerCircle clearing publicKeyJwk) has been fixed directly.
      // This migration is no longer needed.
      //
      // If a bond truly has a broken key-pair mismatch, the Step 1c check
      // below will detect it and mark it as orphaned for vault restore.

      // ========================================
      // PHASE A: Bond shared secret sync
      // ========================================

      // Guard the bonds fetch (network): a failure here must not abort tribe-key
      // phases B/C. On failure we proceed with no bonds this cycle.
      let userBonds: Awaited<ReturnType<typeof getBonds>> = [];
      try {
        const allBonds = await getBonds();
        userBonds = allBonds.filter(b => b.targetType === 'user');
      } catch (err) {
        console.warn('[key-sync] Phase A (getBonds) failed (non-fatal; tribe-key phases continue):', err);
      }
      setTotalBondCount(userBonds.length);

      let ready = 0;
      let orphaned = 0;
      let maxOrphanDate: Date | null = null;
      let maxKeyDate: Date | null = null;
      const orphanNames: string[] = [];

      for (const bond of userBonds) {
        try {
          // Step 1: Ensure we have a local key pair for this bond
          let storedKey = await getBondKey(bond.id);

          if (!storedKey) {
            // Guard: If this bond already has a public key on the server,
            // it means we previously generated keys on another device/session.
            // Generating new keys would clobber the old ones and break
            // all existing encrypted content. Skip and warn.
            if (bond.publicKeyJwk) {
              orphaned++;
              orphanNames.push(bond.targetName || bond.id.substring(0, 12));
              if (bond.lastRefreshedAt && (!maxOrphanDate || bond.lastRefreshedAt > maxOrphanDate)) {
                maxOrphanDate = bond.lastRefreshedAt;
              }
              console.warn(
                `[key-sync] Bond ${bond.id.substring(0, 16)}... has server-side key but no local key. ` +
                `Vault restore needed to recover encryption keys. Skipping key generation to avoid clobbering.`
              );
              continue;
            }

            const keyPair = await generateExportableBondKeyPair();
            const publicKeyJwk = await exportPublicKey(keyPair.publicKey);

            // CAS submit — only succeeds if server key is still empty.
            // If another device submitted between our getBonds() call and now, this rejects.
            const casResult = await submitBondPublicKey(bond.id, JSON.stringify(publicKeyJwk));

            if (casResult.accepted) {
              // We won the race — store locally
              await storeBondKey(bond.id, keyPair.privateKey, publicKeyJwk);
              await deleteSharedSecret(bond.id);
              storedKey = await getBondKey(bond.id);
              newKeysGenerated = true;
              console.debug(`[key-sync] Generated keys for bond ${bond.id.substring(0, 16)}...`);
            } else {
              // Another device won the race — we're orphaned, need vault restore
              orphaned++;
              orphanNames.push(bond.targetName || bond.id.substring(0, 12));
              if (bond.lastRefreshedAt && (!maxOrphanDate || bond.lastRefreshedAt > maxOrphanDate)) {
                maxOrphanDate = bond.lastRefreshedAt;
              }
              console.warn(
                `[key-sync] Bond ${bond.id.substring(0, 16)}... — another device submitted key first (CAS rejected). ` +
                `Vault restore needed.`
              );
              continue;
            }
          }

          // Step 1b: Re-publish local key if server is missing it.
          // This happens after migration clears server keys, or on reconnect.
          // Without this, the peer can't see our public key and can't derive.
          if (storedKey && !bond.publicKeyJwk) {
            try {
              const localPubJwkStr = JSON.stringify(storedKey.publicKeyJwk);
              const resubmitResult = await submitBondPublicKey(bond.id, localPubJwkStr);
              if (resubmitResult.accepted) {
                console.debug(`[key-sync] Re-published local key to server for bond ${bond.id.substring(0, 16)}...`);
              } else {
                // Another device beat us — their key is on the server now
                // Fall through to the mismatch check below
                console.debug(`[key-sync] Server already has a key for bond ${bond.id.substring(0, 16)}... (CAS rejected re-publish)`);
              }
            } catch (resubErr) {
              console.warn(`[key-sync] Failed to re-publish key for bond ${bond.id.substring(0, 16)}...`, resubErr);
            }
          }

          // Step 1c: Detect key-pair mismatch — another device published a
          // different key for this bond. The local key exists but doesn't match
          // what the server has. This means vault restore is needed.
          if (storedKey && bond.publicKeyJwk) {
            try {
              const serverPubJwk: JsonWebKey = JSON.parse(bond.publicKeyJwk);
              const serverKeyHash = await hashPublicKeyJwk(serverPubJwk);
              const localKeyHash = await hashPublicKeyJwk(storedKey.publicKeyJwk);

              if (serverKeyHash !== localKeyHash) {
                orphaned++;
                orphanNames.push(bond.targetName || bond.id.substring(0, 12));
                if (bond.lastRefreshedAt && (!maxOrphanDate || bond.lastRefreshedAt > maxOrphanDate)) {
                  maxOrphanDate = bond.lastRefreshedAt;
                }
                // Invalidate the shared secret — it was derived from the wrong key pair
                await deleteSharedSecret(bond.id);
                // Diagnostic: log the full sorted JWK so we can identify the difference
                const sortJwk = (j: JsonWebKey) => Object.keys(j).sort().reduce((a, k) => {
                  a[k] = (j as Record<string, unknown>)[k]; return a;
                }, {} as Record<string, unknown>);
                console.warn(
                  `[key-sync] Bond ${bond.id.substring(0, 16)}... has key-pair mismatch.\n` +
                  `  Server: ${JSON.stringify(sortJwk(serverPubJwk))}\n` +
                  `  Local:  ${JSON.stringify(sortJwk(storedKey.publicKeyJwk))}\n` +
                  `  Hashes: local=${localKeyHash.substring(0, 12)}... server=${serverKeyHash.substring(0, 12)}...`
                );
                continue;
              } else {
                // Key matches! This is a healthy bond.
                // Track the date to detect if it's newer than the vault backup.
                if (bond.lastRefreshedAt && (!maxKeyDate || bond.lastRefreshedAt > maxKeyDate)) {
                  maxKeyDate = bond.lastRefreshedAt;
                }
              }
            } catch (parseErr) {
              console.warn(`[key-sync] Could not parse server public key for bond ${bond.id.substring(0, 16)}...`, parseErr);
            }
          }

          // Step 2: Check if peer's public key is available
          if (!bond.peerPublicKeyJwk || !storedKey) {
            continue;
          }

          // Step 3: Check if we already have a cached shared secret
          const peerJwk: JsonWebKey = JSON.parse(bond.peerPublicKeyJwk);
          const currentPeerHash = await hashPublicKeyJwk(peerJwk);
          const localHash = await hashPublicKeyJwk(storedKey.publicKeyJwk);
          const cachedSecret = await getSharedSecret(bond.id);

          if (cachedSecret
            && cachedSecret.peerKeyHash === currentPeerHash
            && cachedSecret.localKeyHash === localHash) {
            ready++;
            continue;
          }

          // Step 4: Derive shared secret (new, rotated peer key, or local key changed)
          if (cachedSecret && cachedSecret.peerKeyHash !== currentPeerHash) {
            // Peer rotated! Mark old one historical and fetch the archive
            await markSharedSecretHistorical(bond.id, cachedSecret.peerKeyHash);
            await cachePeerKeyHistory(bond.id, storedKey.privateKey);
          } else if (!cachedSecret) {
            // First derivation (new device, IDB migration, or cleared cache).
            // Still fetch any historical peer keys so we can decrypt old messages
            // from before a rotation we missed.
            await cachePeerKeyHistory(bond.id, storedKey.privateKey);
          }

          const peerPublicKey = await importPublicKey(peerJwk);
          const secret = await deriveSharedSecret(storedKey.privateKey, peerPublicKey);
          await storeSharedSecret(bond.id, secret, currentPeerHash, localHash);
          ready++;

          if (cachedSecret) {
            console.debug(`[key-sync] Re-derived secret for bond ${bond.id.substring(0, 16)}... (key rotated)`);
          } else {
            console.debug(`[key-sync] Derived secret for bond ${bond.id.substring(0, 16)}...`);
          }
        } catch (err) {
          console.warn(`[key-sync] Error processing bond ${bond.id.substring(0, 16)}...:`, err);
        }
      }

      setReadyBondCount(ready);
      setOrphanedBondCount(orphaned);
      setOrphanedBondNames(orphanNames);
      setNewestOrphanDate(maxOrphanDate);
      setNewestKeyDate(maxKeyDate);

      // ========================================
      // PHASE B: Tribe group key sync
      // ========================================
      // Fetch incoming grants and unwrap them using our RSA identity key.

      let tribeReady = 0;
      // True if we end this phase holding grant(s) we cannot unwrap (no usable
      // identity private key) — surfaced so the UI can prompt a vault restore.
      let restoreNeeded = false;

      try {
        const { getMyTribeKeyGrants } = await import('@/lib/actions/tribe-actions');

        // Pass deviceKeyId to get device-targeted grants + legacy grants (NULL fallback)
        const grants = await getMyTribeKeyGrants(currentDeviceKeyId ?? undefined);

        for (const grant of grants) {
          try {
            // Check if we already have this tribe key cached at this version
            const cached = await getTribeKey(user!.id, grant.tribeId);
            if (cached && cached.version === grant.keyVersion) {
              tribeReady++;
              continue;
            }

            if (!identityKey) {
              // We have a grant but no identity key to unwrap it with → the only
              // recovery is restoring this user's vault on this device.
              restoreNeeded = true;
              console.warn(`[key-sync] Cannot unwrap tribe key for ${grant.tribeId} — no identity private key on this device (vault restore needed)`);
              continue;
            }

            // Unwrap the tribe key using our RSA private key
            const tribeKey = await unwrapKeyFromGrant(
              grant.wrappedKey,
              identityKey.privateKey,
            );

            // Cache locally in IndexedDB
            await storeTribeKey(user!.id, grant.tribeId, tribeKey, grant.keyVersion);
            tribeReady++;
            console.debug(`[key-sync] Cached tribe key for ${grant.tribeId.substring(0, 12)}... (v${grant.keyVersion})`);
          } catch (err) {
            // OperationError = RSA key mismatch (grant wrapped with a different key pair).
            // This happens when the user cleared browser data or switched devices,
            // generating a new RSA identity key pair while old grants remain on the server.
            // Fix: delete the stale grant so Phase C (admin-side) re-issues with our current key.
            if (err instanceof DOMException && err.name === 'OperationError') {
              console.warn(`[key-sync] Stale grant detected for ${grant.tribeId.substring(0, 12)}... — deleting for re-issue`);
              try {
                const { deleteTribeKeyGrantForSelf } = await import('@/lib/actions/tribe-actions');
                await deleteTribeKeyGrantForSelf(grant.grantId);
                // Re-publish our current identity public key to ensure admin has the latest
                if (identityKey) {
                  await publishEncryptionPublicKey(identityKey.publicKeyJwk);
                }
              } catch (cleanupErr) {
                console.warn(`[key-sync] Failed to clean up stale grant:`, cleanupErr);
              }
            } else {
              console.warn(`[key-sync] Error processing tribe key for ${grant.tribeId.substring(0, 12)}...:`, err);
            }
          }
        }
      } catch (err) {
        console.warn('[key-sync] Tribe key sync failed:', err);
      }

      setTribeKeysReady(tribeReady);
      setTribeKeyRestoreNeeded(restoreNeeded);

      // ========================================
      // PHASE C: Tribe key generation & distribution
      // ========================================
      // If the current user is a founder/speaker of any private tribe that
      // doesn't yet have a key (or has un-granted members), this phase
      // generates and distributes keys automatically using members' RSA public keys.

      try {
        const { getMyTribesList } = await import('@/lib/actions/content-actions');
        const { getActiveTribeKeyForTribe, initializeTribeKey, issueTribeKeyGrant, getUngrantedTribeDevices } = await import('@/lib/actions/tribe-actions');
        const { getMemberEncryptionKeys } = await import('@/lib/actions/identity-key-actions');
        const { generateTribeGroupKey } = await import('@/lib/crypto/tribe-encryption');

        const myTribes = await getMyTribesList();
        console.log('[key-sync] My tribes list:', myTribes.map(t => `${t.name} (${t.id}, public=${t.isPublic})`));

        // Only process private tribes
        const privateTribes = myTribes.filter(t => !t.isPublic);
        console.log('[key-sync] Private tribes to process:', privateTribes.map(t => t.name));

        for (const tribe of privateTribes) {
          try {
            const { checkTribeAccess } = await import('@/lib/actions/tribe-actions');
            const access = await checkTribeAccess(tribe.id);

            let activeKey = await getActiveTribeKeyForTribe(tribe.id);
            let localTribeKey = await getTribeKey(user!.id, tribe.id);

            const isAdmin = access === 'founder' || access === 'speaker' || access === 'platform_admin';

            // Step 1: Generate initial key (Founder/Admin only)
            if (!activeKey && (access === 'founder' || access === 'platform_admin')) {
              const newKey = await generateTribeGroupKey();
              const tribeKeyId = await initializeTribeKey(tribe.id);

              // Self-grant: wrap tribe key with our own RSA public key
              // so it persists on the server and we can recover it on other devices
              if (identityKey) {
                const myPubKey = await importIdentityPublicKey(identityKey.publicKeyJwk);
                const { wrappedKey, iv } = await wrapKeyForRecipient(newKey, myPubKey);
                // Self-grant targets our device (if registered) for multi-device compat
                await issueTribeKeyGrant(tribeKeyId, user!.id, wrappedKey, iv, currentDeviceKeyId ?? undefined);
              }

              // Cache locally
              await storeTribeKey(user!.id, tribe.id, newKey, 1);
              localTribeKey = { scope: `${user!.id}::${tribe.id}`, userId: user!.id, tribeId: tribe.id, key: newKey, version: 1, receivedAt: Date.now() };
              activeKey = await getActiveTribeKeyForTribe(tribe.id);
            }

            // Step 2: Distribution to ungranted members/devices
            if (isAdmin && activeKey && localTribeKey) {
              const ungrantedDevices = await getUngrantedTribeDevices(tribe.id);

              if (ungrantedDevices.length > 0) {
                console.debug(`[key-sync] Distributing tribe key for ${tribe.name} to ${ungrantedDevices.length} ungranted device(s)...`);

                // Batch fetch public keys for members without registered devices
                // (legacy single-identity model fallback)
                const legacyMemberIds = ungrantedDevices
                  .filter(d => d.deviceKeyId === null)
                  .map(d => d.userId);
                const memberPublicKeys = legacyMemberIds.length > 0
                  ? await getMemberEncryptionKeys(legacyMemberIds)
                  : {};

                for (const target of ungrantedDevices) {
                  try {
                    let pubKeyJwk: JsonWebKey | null = null;

                    if (target.deviceKeyId && target.publicKey) {
                      // Per-device model: use the device's registered public key
                      pubKeyJwk = JSON.parse(target.publicKey) as JsonWebKey;
                    } else {
                      // Legacy model: use the user's identity public key
                      pubKeyJwk = memberPublicKeys[target.userId] ?? null;
                    }

                    if (!pubKeyJwk) {
                      console.debug(`[key-sync] No public key for ${target.userId.substring(0, 8)}... device=${target.deviceKeyId?.substring(0, 8) ?? 'legacy'}, skipping grant`);
                      continue;
                    }

                    // Import their public key and wrap the tribe key
                    const recipientPubKey = await importIdentityPublicKey(pubKeyJwk);
                    const { wrappedKey, iv } = await wrapKeyForRecipient(localTribeKey.key, recipientPubKey);

                    // Submit grant to server with device targeting
                    await issueTribeKeyGrant(
                      activeKey.id,
                      target.userId,
                      wrappedKey,
                      iv,
                      target.deviceKeyId ?? undefined,
                    );
                    console.debug(`[key-sync] Granted tribe key to ${target.userId.substring(0, 8)}... device=${target.deviceKeyId?.substring(0, 8) ?? 'legacy'}`);
                  } catch (grantErr) {
                    console.warn(`[key-sync] Failed to grant tribe key to ${target.userId.substring(0, 8)}... device=${target.deviceKeyId?.substring(0, 8) ?? 'legacy'}:`, grantErr);
                  }
                }
              }
            }
          } catch (tribeErr) {
            console.warn(`[key-sync] Tribe key distribution loop failed for ${tribe.name}:`, tribeErr);
          }
        }
      } catch (err) {
        console.warn('[key-sync] Phase C (tribe key distribution) failed:', err);
      }

      // ========================================
      // COUNTER-SYNC: push merged vault back up
      // ========================================
      // Push when this cycle generated new keys, or when the freshly pulled
      // vault is missing keys this device holds (so other devices can pull them).
      let shouldPushVault = newKeysGenerated || vaultPushPendingRef.current;
      if (!shouldPushVault && vaultSync.active && vaultSync.vaultBondIds) {
        try {
          const { getAllBondKeyIds } = await import('@/lib/crypto/key-store');
          const localIds = await getAllBondKeyIds();
          shouldPushVault = localIds.some(id => !vaultSync.vaultBondIds!.has(id));
          if (shouldPushVault) {
            console.log('[key-sync] Local keys missing from passkey vault — counter-syncing up');
          }
        } catch (err) {
          console.warn('[key-sync] Counter-sync check failed:', err);
        }
      }
      await maybeSaveVault(shouldPushVault);
    } catch (err) {
      console.error('[key-sync] Sync failed:', err);
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
      setInitialSyncDone(true);

      // Notify passive consumers (e.g., useBondCrypto) that keys are ready
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('tribes:key-sync-complete'));
      }
    }
  }, [user?.id, maybeSaveVault, pullPrfVault]);

  // ── Adaptive sync lifecycle ──
  // Fast interval (15s) for the first 2 minutes after mount to quickly
  // distribute keys for new bonds/tribes. Then relaxes to 60s.
  // Pauses entirely when the tab is hidden; resumes on focus.
  const mountedAt = useRef(Date.now());
  const FAST_INTERVAL_MS = 15_000;  // First 2 minutes
  const SLOW_INTERVAL_MS = 60_000;  // After settling
  const FAST_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

  useEffect(() => {
    if (!user?.id) return;

    // Initial sync (with slight delay to not block page load)
    const initialTimeout = setTimeout(() => performSync(), 1000);

    const scheduleNext = () => {
      const elapsed = Date.now() - mountedAt.current;
      const interval = elapsed < FAST_WINDOW_MS ? FAST_INTERVAL_MS : SLOW_INTERVAL_MS;
      intervalRef.current = setTimeout(() => {
        performSync().finally(scheduleNext);
      }, interval);
    };

    // Start the adaptive loop after initial sync
    const startLoop = setTimeout(scheduleNext, 2000);

    // Pause when tab hidden, resume when visible
    const handleVisibility = () => {
      if (document.hidden) {
        // Pause
        if (intervalRef.current) clearTimeout(intervalRef.current);
      } else {
        // Resume immediately
        performSync().finally(scheduleNext);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearTimeout(initialTimeout);
      clearTimeout(startLoop);
      if (intervalRef.current) clearTimeout(intervalRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user?.id, performSync]);

  const triggerSync = useCallback(() => {
    // Reset to fast window when manually triggered (e.g. entering a private tribe)
    mountedAt.current = Date.now();
    performSync();
  }, [performSync]);

  /**
   * Re-generate ECDH keys for bonds that have server-side keys but no local key.
   * This is the "escape hatch" when no vault backup is available.
   * The old public key on the server is replaced, so any posts encrypted with
   * the previous shared secret will become permanently unreadable.
   */
  const rekeyOrphanedBonds = useCallback(async () => {
    if (!user?.id) return;

    try {
      const {
        generateExportableBondKeyPair,
        exportPublicKey,
      } = await import('@/lib/crypto');

      const {
        storeBondKey,
        getBondKey,
        deleteSharedSecret,
      } = await import('@/lib/crypto/key-store');

      const { getBonds, submitBondPublicKey } = await import('@/lib/actions/bond-actions');

      const allBonds = await getBonds();
      const userBonds = allBonds.filter(b => b.targetType === 'user');
      let rekeyed = 0;

      for (const bond of userBonds) {
        const existingKey = await getBondKey(bond.id);
        if (existingKey) continue; // Already has local key

        if (!bond.publicKeyJwk) continue; // No server key either -- fresh bond

        // Generate new key pair, replacing the old server-side key
        const keyPair = await generateExportableBondKeyPair();
        const publicKeyJwk = await exportPublicKey(keyPair.publicKey);

        await storeBondKey(bond.id, keyPair.privateKey, publicKeyJwk);
        // Force overwrite: user explicitly chose "Reset Keys" (destructive)
        await submitBondPublicKey(bond.id, JSON.stringify(publicKeyJwk), true);
        await deleteSharedSecret(bond.id);
        rekeyed++;

        console.log(`[key-sync] Re-keyed orphaned bond ${bond.id.substring(0, 16)}...`);
      }

      console.log(`[key-sync] Re-keyed ${rekeyed} orphaned bonds. Triggering full sync...`);
      setOrphanedBondCount(0);
      setOrphanedBondNames([]);

      // Trigger a full sync to derive shared secrets with the new keys
      mountedAt.current = Date.now();
      await performSync();
    } catch (err) {
      console.error('[key-sync] Failed to re-key orphaned bonds:', err);
    }
  }, [user?.id, performSync]);

  return (
    <KeySyncContext.Provider value={{
      readyBondCount,
      totalBondCount,
      orphanedBondCount,
      orphanedBondNames,
      newestOrphanDate,
      newestKeyDate,
      tribeKeysReady,
      initialSyncDone,
      isSyncing,
      prfSyncActive,
      tribeKeyRestoreNeeded,
      triggerSync,
      rekeyOrphanedBonds,
    }}>
      {children}
    </KeySyncContext.Provider>
  );
}
