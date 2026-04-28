'use client';

/**
 * @fileoverview React hook for managing bond cryptographic keys.
 * Phase 2C: Wires the crypto module (2B) into React components.
 *
 * Usage:
 * ```tsx
 * const { hasKey, isReady, sharedSecret, regenerateKeys } = useBondCrypto(bondId);
 * ```
 *
 * On mount:
 * 1. Checks if a local private key exists in IndexedDB
 * 2. If not, generates a new ECDH key pair
 * 3. Stores private key in IndexedDB (non-extractable)
 * 4. Submits public key to server
 * 5. Fetches the peer's public key from the server
 * 6. If both keys available, derives the shared ECDH secret
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  generateExportableBondKeyPair,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  isCryptoAvailable,
  isKeyStoreAvailable,
} from '@/lib/crypto';
import {
  storeBondKey,
  getBondKey,
  deleteBondKey,
} from '@/lib/crypto/key-store';
import { submitBondPublicKey as submitPublicKeyAction, getPeerPublicKey as getPeerKeyAction } from '@/lib/actions/bond-actions';

export interface UseBondCryptoResult {
  /** Whether we have a local private key for this bond */
  hasKey: boolean;
  /** Whether the crypto module is initialized and ready */
  isReady: boolean;
  /** Whether we're currently generating or exchanging keys */
  isLoading: boolean;
  /** The derived shared secret (null if peer key not yet available) */
  sharedSecret: CryptoKey | null;
  /** Whether the key exchange is complete (both sides have keys) */
  isExchangeComplete: boolean;
  /** Error message if something went wrong */
  error: string | null;
  /** Regenerate keys — new key pair, submit to server, re-derive shared secret */
  regenerateKeys: () => Promise<void>;
  /** Retry fetching the peer's public key */
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
   * Core initialization flow
   */
  const initialize = useCallback(async () => {
    if (!bondId) return;

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

    try {
      setIsLoading(true);
      setError(null);

      // Step 1: Check for existing local key
      let storedKey = await getBondKey(bondId);

      if (!storedKey) {
        // Step 2: Generate new key pair (extractable for vault backup support)
        const keyPair = await generateExportableBondKeyPair();
        const publicKeyJwk = await exportPublicKey(keyPair.publicKey);

        // Step 3: Store private key in IndexedDB
        await storeBondKey(bondId, keyPair.privateKey, publicKeyJwk);

        // Step 4: Submit public key to server
        await submitPublicKeyAction(bondId, JSON.stringify(publicKeyJwk));

        storedKey = await getBondKey(bondId);
      }

      setHasKey(true);

      // Step 5: Fetch peer's public key
      const peerKeyStr = await getPeerKeyAction(bondId);

      if (peerKeyStr && storedKey) {
        // Step 6: Derive shared secret
        const peerJwk: JsonWebKey = JSON.parse(peerKeyStr);
        const peerPublicKey = await importPublicKey(peerJwk);
        const secret = await deriveSharedSecret(storedKey.privateKey, peerPublicKey);

        setSharedSecret(secret);
        setIsExchangeComplete(true);
      }

      setIsReady(true);
    } catch (err: unknown) {
      console.error('[useBondCrypto] Error:', err);
      setError(((err instanceof Error) ? err.message : 'An error occurred') ?? 'Failed to initialize bond crypto');
    } finally {
      setIsLoading(false);
    }
  }, [bondId]);

  /**
   * Regenerate keys — creates a new key pair, replaces the old one
   */
  const regenerateKeys = useCallback(async () => {
    if (!bondId) return;

    try {
      setIsLoading(true);
      setError(null);

      // Delete old key
      await deleteBondKey(bondId);

      // Generate new pair (extractable for vault backup support)
      const keyPair = await generateExportableBondKeyPair();
      const publicKeyJwk = await exportPublicKey(keyPair.publicKey);

      // Store and submit
      await storeBondKey(bondId, keyPair.privateKey, publicKeyJwk);
      await submitPublicKeyAction(bondId, JSON.stringify(publicKeyJwk));

      setHasKey(true);

      // Try to re-derive shared secret with peer
      const peerKeyStr = await getPeerKeyAction(bondId);
      if (peerKeyStr) {
        const peerJwk: JsonWebKey = JSON.parse(peerKeyStr);
        const peerPublicKey = await importPublicKey(peerJwk);
        const storedKey = await getBondKey(bondId);
        if (storedKey) {
          const secret = await deriveSharedSecret(storedKey.privateKey, peerPublicKey);
          setSharedSecret(secret);
          setIsExchangeComplete(true);
        }
      } else {
        setSharedSecret(null);
        setIsExchangeComplete(false);
      }
    } catch (err: unknown) {
      setError(((err instanceof Error) ? err.message : 'An error occurred') ?? 'Failed to regenerate keys');
    } finally {
      setIsLoading(false);
    }
  }, [bondId]);

  /**
   * Retry fetching the peer's public key (for polling/manual refresh)
   */
  const retryPeerKey = useCallback(async () => {
    if (!bondId) return;

    try {
      const peerKeyStr = await getPeerKeyAction(bondId);
      if (peerKeyStr) {
        const peerJwk: JsonWebKey = JSON.parse(peerKeyStr);
        const peerPublicKey = await importPublicKey(peerJwk);
        const storedKey = await getBondKey(bondId);
        if (storedKey) {
          const secret = await deriveSharedSecret(storedKey.privateKey, peerPublicKey);
          setSharedSecret(secret);
          setIsExchangeComplete(true);
        }
      }
    } catch (err: unknown) {
      setError(((err instanceof Error) ? err.message : 'An error occurred') ?? 'Failed to fetch peer key');
    }
  }, [bondId]);

  // Initialize on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    initialize();

    return () => {
      initRef.current = false;
    };
  }, [initialize]);

  return {
    hasKey,
    isReady,
    isLoading,
    sharedSecret,
    isExchangeComplete,
    error,
    regenerateKeys,
    retryPeerKey,
  };
}
