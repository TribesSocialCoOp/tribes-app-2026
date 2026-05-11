'use client';

/**
 * @fileoverview React hook for reading bond cryptographic state.
 *
 * IMPORTANT: This hook is a PASSIVE READER. It never generates keys or
 * submits to the server. All key generation and shared-secret derivation
 * is done by KeySyncProvider — the single source of truth.
 *
 * This hook:
 * 1. Reads the local bond key from IndexedDB
 * 2. Reads the cached shared secret from IndexedDB
 * 3. Listens for `tribes:key-sync-complete` events from KeySyncProvider
 * 4. Exposes the shared secret to the chat page for encrypt/decrypt
 *
 * Usage:
 * ```tsx
 * const { hasKey, isReady, sharedSecret, isExchangeComplete } = useBondCrypto(bondId);
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  isCryptoAvailable,
  isKeyStoreAvailable,
} from '@/lib/crypto';
import {
  getBondKey,
} from '@/lib/crypto/key-store';

export interface UseBondCryptoResult {
  /** Whether we have a local private key for this bond */
  hasKey: boolean;
  /** Whether the crypto module is initialized and ready */
  isReady: boolean;
  /** Whether we're currently waiting for KeySyncProvider */
  isLoading: boolean;
  /** The derived shared secret (null if not yet available) */
  sharedSecret: CryptoKey | null;
  /** Whether the key exchange is complete (both sides have keys + secret derived) */
  isExchangeComplete: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Re-check IndexedDB for updated keys (e.g., after vault restore) */
  retryPeerKey: () => Promise<void>;
}

export function useBondCrypto(bondId: string | undefined): UseBondCryptoResult {
  const [hasKey, setHasKey] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [sharedSecret, setSharedSecret] = useState<CryptoKey | null>(null);
  const [isExchangeComplete, setIsExchangeComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent double-initialization in React strict mode
  const initRef = useRef(false);

  /**
   * Read-only check of IndexedDB for bond key and shared secret.
   * Returns true if we found a usable shared secret.
   */
  const checkIndexedDB = useCallback(async (): Promise<boolean> => {
    if (!bondId) return false;

    try {
      const { getSharedSecret } = await import('@/lib/crypto/key-store');

      // Step 1: Do we have a local key?
      const storedKey = await getBondKey(bondId);
      if (!storedKey) {
        // KeySyncProvider hasn't generated our key yet (or we're orphaned)
        setHasKey(false);
        return false;
      }

      setHasKey(true);

      // Step 2: Do we have a cached shared secret?
      const cached = await getSharedSecret(bondId);
      if (!cached) {
        // Key exists but peer hasn't submitted theirs yet,
        // or KeySyncProvider hasn't derived the secret yet.
        return false;
      }

      // Step 3: We have everything — expose the shared secret
      setSharedSecret(cached.sharedSecret);
      setIsExchangeComplete(true);
      setIsReady(true);
      setIsLoading(false);
      return true;
    } catch (err) {
      console.error('[useBondCrypto] Error reading IndexedDB:', err);
      return false;
    }
  }, [bondId]);

  /**
   * Re-check IndexedDB for updated keys.
   * Called after vault restore or when the user wants to manually retry.
   */
  const retryPeerKey = useCallback(async () => {
    if (!bondId) return;
    setIsLoading(true);
    const ready = await checkIndexedDB();
    if (!ready) {
      // Still not ready — show the "awaiting key exchange" state
      setIsReady(true);
      setIsLoading(false);
    }
  }, [bondId, checkIndexedDB]);

  // Initialize on mount + listen for KeySyncProvider completion events
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Feature detection
    if (!isCryptoAvailable()) {
      setError('Web Crypto API not available in this browser');
      setIsLoading(false);
      return;
    }
    if (!isKeyStoreAvailable()) {
      setError('IndexedDB not available in this browser');
      setIsLoading(false);
      return;
    }

    // Initial check — might already be ready from a previous KeySyncProvider run
    checkIndexedDB().then((ready) => {
      if (!ready) {
        // Not ready yet — that's OK. We'll try again when KeySyncProvider finishes.
        // Mark as ready (not loading) so the UI can show "Awaiting key exchange"
        // instead of an infinite spinner.
        setIsReady(true);
        setIsLoading(false);
      }
    });

    // Listen for KeySyncProvider sync completion
    const handleSyncComplete = () => {
      checkIndexedDB().then((ready) => {
        if (ready) {
          console.debug('[useBondCrypto] Keys ready after sync event');
        }
      });
    };
    window.addEventListener('tribes:key-sync-complete', handleSyncComplete);

    return () => {
      initRef.current = false;
      window.removeEventListener('tribes:key-sync-complete', handleSyncComplete);
    };
  }, [checkIndexedDB]);

  return {
    hasKey,
    isReady,
    isLoading,
    sharedSecret,
    isExchangeComplete,
    error,
    retryPeerKey,
  };
}
