import React, { useEffect, useState } from 'react';
import { decryptFileWithKey, EncryptionMeta } from '@/lib/crypto/file-encryption';
import { getPostKeyGrants } from '@/lib/actions/content-actions';
import { unwrapPostKey } from '@/lib/crypto/post-encryption';
import { Loader2, Lock } from 'lucide-react';
import type { Ring } from '@/lib/types';
import { useUser } from '@/hooks/use-user';

interface EncryptedImageProps {
  fileId: string;
  postId: string;
  /** Ring type of the post — determines which decryption path to use */
  ring?: Ring;
  /** Tribe ID — required for tribe group key decryption */
  tribeId?: string;
  alt?: string;
  className?: string;
}

export function EncryptedImage({ fileId, postId, ring, tribeId, alt, className }: EncryptedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function load() {
      try {
        setLoading(true);
        // 1. Fetch ciphertext via same-origin server proxy (avoids CSP issues
        //    from internal Docker S3 presigned URLs)
        const response = await fetch(`/api/media/${fileId}`);
        if (!response.ok) {
          const errBody = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
          throw new Error(errBody.error || 'Failed to fetch media');
        }

        const ciphertextBuffer = await response.arrayBuffer();

        // 2. Parse encryption meta from response header
        const metaHeader = response.headers.get('X-Encryption-Meta');
        if (!metaHeader) throw new Error('No encryption metadata');
        const meta: EncryptionMeta = JSON.parse(metaHeader);

        // 3. Determine the correct decryption key based on ring type
        let decryptionKey: CryptoKey;

        if (ring === 'tribes' && tribeId) {
          // TRIBE PATH: Try tribe group key first, then fall back to key grants
          const { getTribeKey } = await import('@/lib/crypto/key-store');
          const cachedTribeKey = await getTribeKey(user?.id ?? '', tribeId);

          if (cachedTribeKey) {
            // Direct tribe key decryption — no key grant unwrapping needed
            decryptionKey = cachedTribeKey.key;
          } else {
            // Fallback: pairwise key grants (tribe key not yet distributed)
            decryptionKey = await resolveKeyFromGrants(postId);
          }
        } else if (ring === 'journal') {
          // JOURNAL PATH: personal key only
          const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
          const journalKey = await getOrCreateJournalKey();

          // Journal images are encrypted directly with the journal key
          // (no key grants for journal posts)
          decryptionKey = journalKey;
        } else {
          // BOND RING PATH (inner_circle, my_people): use key grants
          decryptionKey = await resolveKeyFromGrants(postId);
        }

        // 4. Decrypt the file
        const blob = await decryptFileWithKey(
          ciphertextBuffer,
          meta,
          decryptionKey,
          'image/jpeg' // Default to jpeg, actual type is derived by browser if possible
        );

        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        if (active) {
          setObjectUrl(url);
        }
      } catch (err: any) {
        console.error('[EncryptedImage] Decryption failed:', err);
        if (active) setError(err.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    load();

    return () => {
      active = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [fileId, postId, ring, tribeId, user?.id]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted/20 ${className}`}>
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
      </div>
    );
  }

  if (error || !objectUrl) {
    return (
      <div className={`flex flex-col items-center justify-center bg-muted/20 text-muted-foreground ${className}`}>
        <Lock className="h-6 w-6 mb-2 opacity-50" />
        <span className="text-[10px] uppercase font-bold tracking-wider opacity-50">Secure Image</span>
      </div>
    );
  }

  return <img src={objectUrl} alt={alt || 'Encrypted image'} className={className} />;
}

/**
 * Resolves the post decryption key from key grants.
 * Handles both self-grants (journal key) and bond grants (shared secret).
 */
async function resolveKeyFromGrants(postId: string): Promise<CryptoKey> {
  const grants = await getPostKeyGrants([postId]);
  const grant = grants[postId];
  if (!grant) throw new Error('No decryption key found for this post');

  if (!grant.bondId) {
    // Self-grant: wrapped with the author's personal journal key
    const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
    const unwrapSecret = await getOrCreateJournalKey();
    return unwrapPostKey(grant.wrappedKey, grant.wrapIv, unwrapSecret);
  } else {
    // Bond grant: use rotation-aware resolver (Phase 1)
    const { resolvePostKeyForGrant } = await import('@/lib/crypto/key-rotation');
    const postKey = await resolvePostKeyForGrant(grant.bondId, grant.wrappedKey, grant.wrapIv);
    if (!postKey) throw new Error('Key mismatch or access denied (Sync keys in settings)');
    return postKey;
  }
}
