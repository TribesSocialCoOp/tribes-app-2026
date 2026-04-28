'use client';

/**
 * Hook for decrypting encrypted posts in the feed.
 * Phase 3: Ring-level E2E encryption.
 *
 * Fetches key grants for encrypted posts, then uses the appropriate
 * bond shared secret to unwrap the post key and decrypt content.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CommunicationItem } from '@/lib/types';

interface DecryptionCache {
  [postId: string]: string; // postId → decrypted plaintext
}

/**
 * Given a list of feed items, returns a map of decrypted content
 * for encrypted posts, using cached results when available.
 */
export function usePostDecryption(items: CommunicationItem[]) {
  const [decryptedContent, setDecryptedContent] = useState<DecryptionCache>({});
  const [isDecrypting, setIsDecrypting] = useState(false);
  const cacheRef = useRef<DecryptionCache>({});
  const pendingRef = useRef<Set<string>>(new Set());

  const decryptItems = useCallback(async (encryptedItems: CommunicationItem[]) => {
    // Filter to items that need decryption and aren't already cached/pending
    const needsDecryption = encryptedItems.filter(
      item => item.isEncrypted
        && item.ciphertextBase64
        && item.encryptionIv
        && !cacheRef.current[item.id]
        && !pendingRef.current.has(item.id)
    );

    if (needsDecryption.length === 0) return;

    // Mark as pending
    for (const item of needsDecryption) {
      pendingRef.current.add(item.id);
    }

    setIsDecrypting(true);

    try {
      const { isKeyStoreAvailable } = await import('@/lib/crypto');

      if (!isKeyStoreAvailable()) {
        console.warn('[usePostDecryption] IndexedDB not available, cannot decrypt');
        return;
      }

      const newDecrypted: DecryptionCache = {};

      // Split into journal posts (personal key) vs ring posts (key grants)
      const journalItems = needsDecryption.filter(item => item.ring === 'journal');
      const ringItems = needsDecryption.filter(item => item.ring !== 'journal');

      // ── Journal decryption: personal key, no grants ──────────
      if (journalItems.length > 0) {
        try {
          const { getOrCreateJournalKey, decryptJournalEntry } = await import('@/lib/crypto/journal-encryption');
          const journalKey = await getOrCreateJournalKey();

          for (const item of journalItems) {
            try {
              const plaintext = await decryptJournalEntry(
                item.ciphertextBase64!,
                item.encryptionIv!,
                journalKey,
              );
              newDecrypted[item.id] = plaintext;
            } catch (err) {
              console.error(`[usePostDecryption] Journal decrypt failed for ${item.id}:`, err);
              newDecrypted[item.id] = '🔒 Journal key missing (Sync keys in settings)';
            }
          }
        } catch (err) {
          console.error('[usePostDecryption] Journal key not available:', err);
          for (const item of journalItems) {
            newDecrypted[item.id] = '🔒 Journal key missing (Sync keys in settings)';
          }
        }
      }

      // ── Ring decryption: key grants + bond shared secret ─────
      if (ringItems.length > 0) {
        const { getPostKeyGrants } = await import('@/lib/actions/content-actions');
        const ringPostIds = ringItems.map(item => item.id);
        const grants = await getPostKeyGrants(ringPostIds);

        const { decryptPost } = await import('@/lib/crypto/post-encryption');
        const { getBondKey } = await import('@/lib/crypto');
        const { deriveSharedSecret, importPublicKey } = await import('@/lib/crypto');

        for (const item of ringItems) {
          const grant = grants[item.id];
          if (!grant) {
            newDecrypted[item.id] = '🔒 You don\'t have access to this encrypted post';
            continue;
          }

          try {
            let unwrapSecret: CryptoKey;

            if (!grant.bondId) {
              // Self-grant: wrapped with the author's personal journal key
              try {
                const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
                unwrapSecret = await getOrCreateJournalKey();
              } catch {
                newDecrypted[item.id] = '🔒 Personal key missing (Sync keys in settings)';
                continue;
              }
            } else {
              // Bond grant: derive shared secret from bond keys
              const bondKey = await getBondKey(grant.bondId);
              if (!bondKey) {
                newDecrypted[item.id] = '🔒 Bond key missing (Sync keys in settings)';
                continue;
              }

              const { getBonds } = await import('@/lib/actions/bond-actions');
              const bonds = await getBonds();
              const bond = bonds.find(b => b.id === grant.bondId);
              if (!bond?.peerPublicKeyJwk) {
                newDecrypted[item.id] = '🔒 Partner key not available';
                continue;
              }

              const partnerPubKey = await importPublicKey(JSON.parse(bond.peerPublicKeyJwk));
              unwrapSecret = await deriveSharedSecret(bondKey.privateKey, partnerPubKey);
            }

            const ciphertextBin = atob(item.ciphertextBase64!);
            const ciphertextBytes = new Uint8Array(ciphertextBin.length);
            for (let i = 0; i < ciphertextBin.length; i++) {
              ciphertextBytes[i] = ciphertextBin.charCodeAt(i);
            }

            const plaintext = await decryptPost(
              ciphertextBytes.buffer,
              item.encryptionIv!,
              grant.wrappedKey,
              grant.wrapIv,
              unwrapSecret,
            );

            newDecrypted[item.id] = plaintext;
          } catch (err) {
            console.error(`[usePostDecryption] Failed to decrypt post ${item.id}:`, err);
            newDecrypted[item.id] = '🔒 Decryption failed';
          }
        }
      }

      // Update cache
      cacheRef.current = { ...cacheRef.current, ...newDecrypted };
      setDecryptedContent(prev => ({ ...prev, ...newDecrypted }));
    } catch (err) {
      console.error('[usePostDecryption] Batch decryption error:', err);
    } finally {
      setIsDecrypting(false);
      for (const item of needsDecryption) {
        pendingRef.current.delete(item.id);
      }
    }
  }, []);

  // Trigger decryption when items change
  useEffect(() => {
    const encrypted = items.filter(item => item.isEncrypted);
    if (encrypted.length > 0) {
      decryptItems(encrypted);
    }
  }, [items, decryptItems]);

  /**
   * Returns the decrypted content for a post, or the original content
   * if the post isn't encrypted.
   */
  const getContent = useCallback((item: CommunicationItem): string => {
    if (!item.isEncrypted) return item.content ?? '';
    return decryptedContent[item.id] ?? '🔒 Decrypting...';
  }, [decryptedContent]);

  return {
    getContent,
    isDecrypting,
    decryptedContent,
  };
}
