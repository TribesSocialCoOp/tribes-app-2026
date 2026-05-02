import React, { useEffect, useState } from 'react';
import { resolveMediaUrl } from '@/lib/actions/media-actions';
import { decryptDownloadedFile, EncryptionMeta } from '@/lib/crypto/file-encryption';
import { getPostKeyGrants } from '@/lib/actions/content-actions';
import { unwrapPostKey, decryptPost } from '@/lib/crypto/post-encryption';
import { getOrCreateJournalKey } from '@/lib/crypto/journal-encryption';
import { Loader2, Lock } from 'lucide-react';

interface EncryptedImageProps {
  fileId: string;
  postId: string;
  alt?: string;
  className?: string;
}

export function EncryptedImage({ fileId, postId, alt, className }: EncryptedImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function load() {
      try {
        setLoading(true);
        // 1. Resolve media URL and encryption meta
        const mediaInfo = await resolveMediaUrl(fileId);
        if (!mediaInfo || !mediaInfo.url || !mediaInfo.encryptionMeta) {
          throw new Error('Failed to resolve media info');
        }

        // 2. Fetch the ciphertext blob
        const response = await fetch(mediaInfo.url);
        if (!response.ok) throw new Error('Failed to fetch media');
        const ciphertextBuffer = await response.arrayBuffer();

        // 3. Get the postKey for decryption
        // We need the post key. Wait, post key was wrapped for the user.
        // We can fetch key grants for this post.
        const grants = await getPostKeyGrants([postId]);
        const selfGrant = grants[postId];
        if (!selfGrant) throw new Error('No decryption key found for this post');

        const journalKey = await getOrCreateJournalKey();
        const postKey = await unwrapPostKey(selfGrant.wrappedKey, selfGrant.wrapIv, journalKey);

        // 4. Decrypt the file
        const { decryptFileWithKey } = await import('@/lib/crypto/file-encryption');
        const blob = await decryptFileWithKey(
          ciphertextBuffer,
          mediaInfo.encryptionMeta as EncryptionMeta,
          postKey,
          'image/jpeg' // Default to jpeg, actual type is derived by browser if possible
        );

        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        if (active) {
          setObjectUrl(url);
        }
      } catch (err: any) {
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
  }, [fileId, postId]);

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
