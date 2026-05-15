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

      // ── Ring decryption: tribe group key OR key grants ───────
      if (ringItems.length > 0) {
        // Separate tribe-key items from grant-based items
        const tribeItems = ringItems.filter(item => item.ring === 'tribes' && item.tribeId);
        const grantItems = ringItems.filter(item => !(item.ring === 'tribes' && item.tribeId));

        // ── Tribe group key decryption (O(1) — no per-recipient grants) ──
        if (tribeItems.length > 0) {
          const { getTribeKey } = await import('@/lib/crypto/key-store');
          const { decryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');

          for (const item of tribeItems) {
            try {
              const cachedTribeKey = await getTribeKey(item.tribeId!);
              if (cachedTribeKey) {
                const { fromBase64 } = await import('@/lib/crypto/encoding');
              const ciphertextBuffer = fromBase64(item.ciphertextBase64!);

                const plaintext = await decryptWithTribeKey(
                  ciphertextBuffer,
                  item.encryptionIv!,
                  cachedTribeKey.key,
                );
                newDecrypted[item.id] = plaintext;
              } else {
                // No tribe key — fall through to grant-based decryption
                grantItems.push(item);
              }
            } catch (err) {
              console.error(`[usePostDecryption] Tribe key decrypt failed for ${item.id}:`, err);
              // Tribe key failed — try grant-based fallback
              grantItems.push(item);
            }
          }
        }

        // ── Grant-based decryption (pairwise sender key model) ──
        if (grantItems.length > 0) {
          const { getPostKeyGrants } = await import('@/lib/actions/content-actions');
          const grantPostIds = grantItems.map(item => item.id);
          const grants = await getPostKeyGrants(grantPostIds);

          for (const item of grantItems) {
            const grant = grants[item.id];
            if (!grant) {
              newDecrypted[item.id] = '🔒 You don\'t have access to this encrypted post';
              continue;
            }

            try {
              const { fromBase64 } = await import('@/lib/crypto/encoding');
              const ciphertextBuffer = fromBase64(item.ciphertextBase64!);
              let plaintext: string;

              if (!grant.bondId) {
                // Self-grant: wrapped with the author's personal journal key
                const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
                const { decryptPost } = await import('@/lib/crypto/post-encryption');
                const journalKey = await getOrCreateJournalKey();
                plaintext = await decryptPost(
                  ciphertextBuffer,
                  item.encryptionIv!,
                  grant.wrappedKey,
                  grant.wrapIv,
                  journalKey,
                );
              } else {
                // Bond grant: use rotation-aware resolver
                const { resolvePostKeyForGrant } = await import('@/lib/crypto/key-rotation');
                const { decryptWithPostKey } = await import('@/lib/crypto/post-encryption');
                
                const postKey = await resolvePostKeyForGrant(grant.bondId, grant.wrappedKey, grant.wrapIv);
                if (!postKey) {
                   throw new Error('Key mismatch or access denied');
                }
                plaintext = await decryptWithPostKey(ciphertextBuffer, item.encryptionIv!, postKey);
              }

              newDecrypted[item.id] = plaintext;
            } catch (err) {
              console.error(`[usePostDecryption] Failed to decrypt post ${item.id}:`, err);
              if (err instanceof DOMException && err.name === 'OperationError') {
                newDecrypted[item.id] = '🔒 Key mismatch -- this post was encrypted with a previous key';
              } else {
                newDecrypted[item.id] = '🔒 Decryption failed';
              }
            }
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
