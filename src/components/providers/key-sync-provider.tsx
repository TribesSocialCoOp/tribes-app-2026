'use client';

/**
 * @fileoverview Background Key Sync Provider.
 *
 * Runs on app mount inside the authenticated layout. Eagerly generates
 * ECDH key pairs for all bonds and pre-derives shared secrets so that
 * encryption is ready before the user ever opens a chat or composes a post.
 *
 * This replaces the previous model where keys were only generated when
 * the user visited the bond chat page (via useBondCrypto).
 *
 * Responsibilities:
 * 1. Generate ECDH key pairs for any bonds missing local private keys
 * 2. Upload public keys to the server for those bonds
 * 3. Pre-derive and cache shared secrets for bonds where the peer's key is available
 * 4. Detect peer key rotations and re-derive shared secrets
 * 5. Fetch, unwrap, and cache tribe group keys for private tribe membership
 * 6. Run periodically (every 60s) to pick up new bonds and peer keys
 */

import React, { useEffect, useRef, useCallback, createContext, useContext, useState } from 'react';
import { useUser } from '@/hooks/use-user';

// ============================================================
// CONTEXT — Exposes sync status to consumers
// ============================================================

interface KeySyncState {
  /** Number of bonds with completed key exchange (shared secret available) */
  readyBondCount: number;
  /** Total number of user-type bonds */
  totalBondCount: number;
  /** Number of private tribes with a locally cached group key */
  tribeKeysReady: number;
  /** Whether the initial sync has completed at least once */
  initialSyncDone: boolean;
  /** Whether a sync is currently in progress */
  isSyncing: boolean;
  /** Trigger an immediate sync (e.g., after accepting a bond) */
  triggerSync: () => void;
}

const KeySyncContext = createContext<KeySyncState>({
  readyBondCount: 0,
  totalBondCount: 0,
  tribeKeysReady: 0,
  initialSyncDone: false,
  isSyncing: false,
  triggerSync: () => {},
});

export const useKeySync = () => useContext(KeySyncContext);

// ============================================================
// SYNC INTERVAL
// ============================================================

const SYNC_INTERVAL_MS = 60_000; // 60 seconds

// ============================================================
// PROVIDER COMPONENT
// ============================================================

export function KeySyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const syncLock = useRef(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [readyBondCount, setReadyBondCount] = useState(0);
  const [totalBondCount, setTotalBondCount] = useState(0);
  const [tribeKeysReady, setTribeKeysReady] = useState(0);
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  /**
   * Core sync function. Processes all user-type bonds + tribe group keys:
   * 1. Generate key pairs for bonds without local keys
   * 2. Upload public keys for newly generated pairs
   * 3. Derive shared secrets for bonds with available peer keys
   * 4. Fetch and unwrap tribe group keys using bond shared secrets
   */
  const performSync = useCallback(async () => {
    if (syncLock.current || !user?.id) return;
    syncLock.current = true;
    setIsSyncing(true);

    try {
      // Dynamic imports — browser-only modules
      const {
        isCryptoAvailable,
        isKeyStoreAvailable,
        generateExportableBondKeyPair,
        exportPublicKey,
        importPublicKey,
        deriveSharedSecret,
      } = await import('@/lib/crypto');

      const {
        storeBondKey,
        getBondKey,
        storeSharedSecret,
        getSharedSecret,
        hashPublicKeyJwk,
        storeTribeKey,
        getTribeKey,
      } = await import('@/lib/crypto/key-store');

      const { getBonds, submitBondPublicKey } = await import('@/lib/actions/bond-actions');

      // Feature detection
      if (!isCryptoAvailable() || !isKeyStoreAvailable()) {
        console.warn('[key-sync] Crypto or IndexedDB not available, skipping');
        return;
      }

      // ========================================
      // PHASE A: Bond shared secret sync
      // ========================================

      const allBonds = await getBonds();
      const userBonds = allBonds.filter(b => b.targetType === 'user');
      setTotalBondCount(userBonds.length);

      let ready = 0;

      for (const bond of userBonds) {
        try {
          // Step 1: Ensure we have a local key pair for this bond
          let storedKey = await getBondKey(bond.id);

          if (!storedKey) {
            const keyPair = await generateExportableBondKeyPair();
            const publicKeyJwk = await exportPublicKey(keyPair.publicKey);

            await storeBondKey(bond.id, keyPair.privateKey, publicKeyJwk);
            await submitBondPublicKey(bond.id, JSON.stringify(publicKeyJwk));

            storedKey = await getBondKey(bond.id);
            console.debug(`[key-sync] Generated keys for bond ${bond.id.substring(0, 16)}...`);
          }

          // Step 2: Check if peer's public key is available
          if (!bond.peerPublicKeyJwk || !storedKey) {
            continue;
          }

          // Step 3: Check if we already have a cached shared secret
          const peerJwk: JsonWebKey = JSON.parse(bond.peerPublicKeyJwk);
          const currentPeerHash = await hashPublicKeyJwk(peerJwk);
          const cachedSecret = await getSharedSecret(bond.id);

          if (cachedSecret && cachedSecret.peerKeyHash === currentPeerHash) {
            ready++;
            continue;
          }

          // Step 4: Derive shared secret (new or rotated peer key)
          const peerPublicKey = await importPublicKey(peerJwk);
          const secret = await deriveSharedSecret(storedKey.privateKey, peerPublicKey);
          await storeSharedSecret(bond.id, secret, currentPeerHash);
          ready++;

          if (cachedSecret) {
            console.debug(`[key-sync] Re-derived secret for bond ${bond.id.substring(0, 16)}... (peer key rotated)`);
          } else {
            console.debug(`[key-sync] Derived secret for bond ${bond.id.substring(0, 16)}...`);
          }
        } catch (err) {
          console.warn(`[key-sync] Error processing bond ${bond.id.substring(0, 16)}...:`, err);
        }
      }

      setReadyBondCount(ready);

      // ========================================
      // PHASE B: Tribe group key sync
      // ========================================

      let tribeReady = 0;

      try {
        const { getMyTribeKeyGrants } = await import('@/lib/actions/tribe-actions');
        const { unwrapTribeKey } = await import('@/lib/crypto/tribe-encryption');

        const grants = await getMyTribeKeyGrants();

        for (const grant of grants) {
          try {
            // Check if we already have this tribe key cached at this version
            const cached = await getTribeKey(grant.tribeId);
            if (cached && cached.version === grant.keyVersion) {
              tribeReady++;
              continue;
            }

            // Find the unwrapping secret:
            // - If bondId is set, use the bond shared secret
            // - If bondId is null, use the journal key (self-grant)
            let unwrappingSecret: CryptoKey;

            if (grant.bondId) {
              const bondSecret = await getSharedSecret(grant.bondId);
              if (!bondSecret) {
                console.debug(`[key-sync] Skipping tribe ${grant.tribeId.substring(0, 12)}... — bond secret not yet available`);
                continue;
              }
              unwrappingSecret = bondSecret.sharedSecret;
            } else {
              const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
              unwrappingSecret = await getOrCreateJournalKey();
            }

            // Unwrap the tribe key
            const tribeKey = await unwrapTribeKey(
              grant.wrappedKey,
              grant.wrapIv,
              unwrappingSecret,
            );

            // Cache locally
            await storeTribeKey(grant.tribeId, tribeKey, grant.keyVersion);
            tribeReady++;
            console.debug(`[key-sync] Cached tribe key for ${grant.tribeId.substring(0, 12)}... (v${grant.keyVersion})`);
          } catch (err) {
            console.warn(`[key-sync] Error processing tribe key for ${grant.tribeId.substring(0, 12)}...:`, err);
          }
        }
      } catch (err) {
        console.warn('[key-sync] Tribe key sync failed:', err);
      }

      setTribeKeysReady(tribeReady);
    } catch (err) {
      console.error('[key-sync] Sync failed:', err);
    } finally {
      syncLock.current = false;
      setIsSyncing(false);
      setInitialSyncDone(true);
    }
  }, [user?.id]);

  // Run on mount + periodic interval
  useEffect(() => {
    if (!user?.id) return;

    // Initial sync (with slight delay to not block page load)
    const initialTimeout = setTimeout(() => performSync(), 1000);

    // Periodic sync
    intervalRef.current = setInterval(performSync, SYNC_INTERVAL_MS);

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id, performSync]);

  const triggerSync = useCallback(() => {
    performSync();
  }, [performSync]);

  return (
    <KeySyncContext.Provider value={{
      readyBondCount,
      totalBondCount,
      tribeKeysReady,
      initialSyncDone,
      isSyncing,
      triggerSync,
    }}>
      {children}
    </KeySyncContext.Provider>
  );
}
