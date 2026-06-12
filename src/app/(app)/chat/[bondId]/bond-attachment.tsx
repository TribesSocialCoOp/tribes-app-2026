"use client";

/**
 * BondAttachment — fetches an encrypted chat attachment, decrypts it with the
 * bond's shared secret, and renders an inline image preview (for images) or a
 * downloadable file chip (everything else).
 *
 * The ciphertext is fetched via the same-origin /api/media proxy (avoids CSP
 * issues with internal S3 URLs) and decrypted client-side — the server never
 * sees the plaintext. The encryption metadata travels on the chat message
 * (attachmentEncryptionMeta), so it's available to both bond participants.
 */

import React, { useEffect, useState } from 'react';
import { FileIcon, ImageIcon, Download, Loader2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EncryptionMeta } from '@/lib/crypto/file-encryption';

interface BondAttachmentProps {
  fileId: string;
  fileName: string;
  fileType?: string;
  fileSize?: number;
  /** JSON-encoded EncryptionMeta stored on the message */
  encryptionMeta?: string;
  sharedSecret: CryptoKey | null;
  isMine: boolean;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function BondAttachment({
  fileId,
  fileName,
  fileType,
  fileSize,
  encryptionMeta,
  sharedSecret,
  isMine,
}: BondAttachmentProps) {
  const isImage = (fileType ?? '').startsWith('image/');
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function load() {
      if (!sharedSecret) return; // wait for the shared secret
      try {
        setLoading(true);
        setError(null);

        // 1. Fetch ciphertext via the same-origin media proxy
        const res = await fetch(`/api/media/${fileId}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(body.error || 'Failed to fetch attachment');
        }
        const ciphertext = await res.arrayBuffer();

        // 2. Resolve encryption metadata — prefer the message's copy, fall
        //    back to the proxy's X-Encryption-Meta header.
        let metaRaw = encryptionMeta && encryptionMeta !== '{}' ? encryptionMeta : null;
        if (!metaRaw) metaRaw = res.headers.get('X-Encryption-Meta');
        if (!metaRaw) throw new Error('Missing encryption metadata');
        const meta: EncryptionMeta = JSON.parse(metaRaw);

        // 3. Decrypt with the bond shared secret
        const { decryptFileWithKey } = await import('@/lib/crypto/file-encryption');
        const blob = await decryptFileWithKey(ciphertext, meta, sharedSecret, fileType || 'application/octet-stream');

        if (!active) return;
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setObjectUrl(url);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load attachment');
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [fileId, encryptionMeta, sharedSecret, fileType]);

  function handleDownload() {
    if (!objectUrl) return;
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── Image preview ──
  if (isImage) {
    return (
      <div className="mb-1.5 overflow-hidden rounded-lg max-w-[260px]">
        {loading && (
          <div className="flex items-center justify-center h-40 bg-background/40">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 text-xs text-destructive bg-destructive/10 rounded-lg">
            <AlertTriangle className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        {objectUrl && !error && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={objectUrl}
            alt={fileName}
            className="block w-full h-auto cursor-pointer rounded-lg"
            onClick={handleDownload}
          />
        )}
      </div>
    );
  }

  // ── File chip ──
  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={!objectUrl}
      className={cn(
        'mb-1.5 flex items-center gap-2 rounded-lg border px-3 py-2 w-full max-w-[260px] text-left transition-colors',
        isMine ? 'border-primary-foreground/30 hover:bg-primary-foreground/10' : 'border-border hover:bg-muted',
        !objectUrl && 'opacity-70 cursor-default',
      )}
    >
      {loading ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      ) : error ? (
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
      ) : isImage ? (
        <ImageIcon className="h-4 w-4 shrink-0" />
      ) : (
        <FileIcon className="h-4 w-4 shrink-0" />
      )}
      <span className="flex-1 min-w-0">
        <span className="block truncate text-sm">{fileName}</span>
        <span className="block text-xs opacity-70">
          {error ? error : formatSize(fileSize)}
        </span>
      </span>
      {objectUrl && !error && <Download className="h-4 w-4 shrink-0 opacity-70" />}
    </button>
  );
}
