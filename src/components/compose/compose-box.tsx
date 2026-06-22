"use client";

import React, { useState, useRef, useTransition, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { UserAvatar } from '@/components/ui/user-avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { RingSelector } from './ring-selector';
import { MoodTagSelector } from './mood-tag-selector';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { createRingPost, type CreateRingPostPayload } from '@/lib/actions/content-actions';
import type { Ring, LinkPreviewData } from '@/lib/types';
import { ImagePlus, Send, Loader2, X, Lock, Globe, Link2 } from 'lucide-react';
import { MentionAutocomplete } from './mention-autocomplete';
import { useMentionAutocomplete } from '@/hooks/use-mention-autocomplete';
import { EmojiAutocomplete } from './emoji-autocomplete';
import { useEmojiAutocomplete } from '@/hooks/use-emoji-autocomplete';
import { cn, cleanUrl } from '@/lib/utils';
import { useActionError } from '@/hooks/use-action-error';
import { uploadFile } from '@/lib/upload';
import { useKeySync } from '@/components/providers/key-sync-provider';
import { triggerHaptic } from '@/lib/capacitor/haptics';
import { ImpactStyle } from '@capacitor/haptics';
import { LinkPreviewCard, LinkPreviewSkeleton } from '@/components/ui/link-preview-card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, AtSign } from 'lucide-react';

const STORAGE_KEY = 'tribes_last_ring';

const IMAGE_LIMITS: Record<string, number> = {
  'Human_Free': 1,
  'Human_Paid': 4,
  'Human_Member': 4,
  'Creator': 10,
  'Admin': 10,
  'Org_Base': 10,
  'Org_Pro': 20,
  'Org_Enterprise': 50,
};

interface ComposeBoxProps {
  onPostCreated?: () => void;
  defaultRing?: Ring;
  defaultTribeId?: string;
  className?: string;
}

export function ComposeBox({
  onPostCreated,
  defaultRing,
  defaultTribeId,
  className,
}: ComposeBoxProps) {
  const { user } = useUser();
  const { toast } = useToast();
  const { handleError } = useActionError();
  const { triggerSync } = useKeySync();
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);


  /** Focus the textarea and scroll the compose card into view after the keyboard opens */
  const focusAndScroll = useCallback(() => {
    textareaRef.current?.focus();
    setTimeout(() => {
      cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 300);
  }, []);

  useEffect(() => {
    if (searchParams?.get('compose') === 'true') {
      setIsExpanded(true);
      setTimeout(() => focusAndScroll(), 50);

      // Clean up the URL parameter
      const params = new URLSearchParams(searchParams.toString());
      params.delete('compose');
      const newUrl = `${pathname}${params.toString() ? `?${params.toString()}` : ''}`;
      router.replace(newUrl, { scroll: false });
    }
  }, [searchParams, pathname, router]);

  // Encryption status for UI feedback
  const [encryptionStatus, setEncryptionStatus] = useState<{
    encrypted: boolean;
    totalRecipients: number;
    encryptedRecipients: number;
  } | null>(null);

  // Ring state
  const savedRing = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) as Ring | null : null;
  const [ring, setRing] = useState<Ring>(defaultRing ?? savedRing ?? 'my_people');
  const [selectedTribeIds, setSelectedTribeIds] = useState<string[]>(
    defaultTribeId ? [defaultTribeId] : []
  );

  // Content state
  const [content, setContent] = useState('');

  const { mentionQuery, mentionRef, checkMention, handleSelectMention, handleMentionKeyDown } =
    useMentionAutocomplete(textareaRef, content, setContent);
  const { emojiQuery, emojiRef, checkEmoji, handleSelectEmoji, handleEmojiKeyDown } =
    useEmojiAutocomplete(textareaRef, content, setContent);
  const [moodTag, setMoodTag] = useState<string | null>(null);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [loadedTribes, setLoadedTribes] = useState<any[]>([]);

  // Identity state
  const [selectedIdentity, setSelectedIdentity] = useState<{ name: string; avatar?: string } | null>(null);

  // Link preview state
  const [linkPreview, setLinkPreview] = useState<LinkPreviewData | null>(null);
  const [isUnfurling, setIsUnfurling] = useState(false);
  const [linkDismissed, setLinkDismissed] = useState(false);
  const lastUnfurledUrl = useRef<string | null>(null);

  const activeTribe = ring === 'tribes' && selectedTribeIds.length > 0 
    ? loadedTribes.find(t => t.id === selectedTribeIds[0]) 
    : null;

  const defaultIdentity = {
    name: activeTribe?.joinedAsAlias || user?.name || "Unknown",
    avatar: activeTribe?.joinedAsAvatar || user?.avatar || undefined,
  };

  useEffect(() => {
    if (ring === 'tribes' && activeTribe && activeTribe.moods) {
      if (moodTag && !activeTribe.moods.includes(moodTag)) {
        setMoodTag(null);
      }
    }
  }, [ring, activeTribe, moodTag]);

  const composeUser = selectedIdentity || defaultIdentity;

  // ── URL detection & unfurl ──────────────────────────────────
  const URL_REGEX = /https?:\/\/[^\s<>"']+/i;
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Skip if dismissed or no content
    if (linkDismissed || !content) {
      // Only clear preview if content was fully emptied (not just dismissed)
      if (!content && lastUnfurledUrl.current) {
        setLinkPreview(null);
        setIsUnfurling(false);
        lastUnfurledUrl.current = null;
      }
      return;
    }

    const match = content.match(URL_REGEX);
    const detectedUrl = match ? cleanUrl(match[0]) : null;

    // URL was removed from content — clear preview
    if (!detectedUrl && lastUnfurledUrl.current) {
      setLinkPreview(null);
      setIsUnfurling(false);
      lastUnfurledUrl.current = null;
      return;
    }

    // No URL found and none previously tracked — nothing to do
    if (!detectedUrl) return;

    // Same URL as before — keep existing preview, don't refetch
    if (detectedUrl === lastUnfurledUrl.current) return;

    // New URL detected — debounce the fetch
    const timer = setTimeout(() => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      lastUnfurledUrl.current = detectedUrl;
      setIsUnfurling(true);

      fetch('/api/unfurl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: detectedUrl }),
        signal: controller.signal,
      })
        .then(async (response) => {
          if (controller.signal.aborted) return;
          if (response.ok) {
            const data: LinkPreviewData = await response.json();
            if (!controller.signal.aborted) {
              setLinkPreview(data);
            }
          }
          // On non-ok response, just leave preview as-is (don't clear)
        })
        .catch(() => {
          // Aborted or network error — don't clear existing preview
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsUnfurling(false);
          }
        });
    }, 600);

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, linkDismissed]);

  const initials = (user?.name ?? 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const handleSubmit = (e?: React.FormEvent | React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!content.trim() && imageFiles.length === 0) return;

    startTransition(async () => {
      try {
        let encryption: CreateRingPostPayload['encryption'] | undefined;
        let imageEncryptionKey: CryptoKey | undefined; // Key for encrypting images

        // E2E encryption — journal uses personal key, rings use sender key model
        if (ring === 'journal') {
          // Journal: encrypt with personal key (single-reader, no key grants)
          try {
            const { getOrCreateJournalKey, encryptJournalEntry } = await import('@/lib/crypto/journal-encryption');
            const journalKey = await getOrCreateJournalKey();
            const result = await encryptJournalEntry(content.trim(), journalKey);

            encryption = {
              ciphertextBase64: result.ciphertextBase64,
              iv: result.iv,
              keyGrants: [], // No recipients — only the author decrypts
            };
            imageEncryptionKey = journalKey; // Use journal key for images too
          } catch (encErr) {
            throw new Error('Journal encryption failed');
          }
        } else if (ring === 'tribes' && selectedTribeIds.length > 0) {
          // TRIBE RING: Use group symmetric key for private tribes (O(1) encryption)
          // Decision to encrypt is based on the tribe's privacy flag, NOT on
          // the recipients list. This prevents the bug where a solo founder
          // (the only member) would skip encryption because
          // getEncryptionRecipients excludes the author, returning [].
          if (activeTribe && !activeTribe.isPublic) {
            // Private tribe — encryption is ALWAYS required regardless of member count
            const { getTribeKey } = await import('@/lib/crypto/key-store');
            const primaryTribeId = selectedTribeIds[0];
            const cachedTribeKey = primaryTribeId ? await getTribeKey(user?.id ?? '', primaryTribeId) : null;

            if (!cachedTribeKey) {
              // No tribe key available — block the post entirely
              toast({
                variant: 'destructive',
                title: 'Encryption Keys Syncing',
                description: 'Your device is still receiving the encryption keys for this tribe. Please wait a moment and try again.',
              });
              // Trigger a key sync to speed up the process
              triggerSync();
              return;
            }

            // Encrypt with tribe group key (O(1) — single encrypt for all members)
            const { encryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
            const { toBase64 } = await import('@/lib/crypto/encoding');

            const result = await encryptWithTribeKey(content.trim(), cachedTribeKey.key);

            encryption = {
              ciphertextBase64: toBase64(result.ciphertext),
              iv: result.iv,
              keyGrants: [], // No per-recipient grants — all members share the tribe key
            };
            imageEncryptionKey = cachedTribeKey.key;

            setEncryptionStatus({ encrypted: true, totalRecipients: 1, encryptedRecipients: 1 });
          } else {
            // Public tribe — no encryption needed
            setEncryptionStatus({ encrypted: false, totalRecipients: 0, encryptedRecipients: 0 });
          }
        } else if (ring === 'inner_circle' || ring === 'my_people') {
          // BOND RINGS: Pairwise sender key model
          try {
            const { getEncryptionRecipients } = await import('@/lib/actions/content-actions');
            const recipients = await getEncryptionRecipients(ring);

            if (recipients.length > 0) {
              const { getSharedSecret } = await import('@/lib/crypto/key-store');
              const { getBondKey, importPublicKey, deriveSharedSecret } = await import('@/lib/crypto');
              const { getBonds } = await import('@/lib/actions/bond-actions');
              const allBonds = await getBonds();
              const bondMap = new Map(allBonds.map(b => [b.id, b]));

              const recipientKeys: Array<{ userId: string; bondId?: string; sharedSecret: CryptoKey }> = [];

              for (const r of recipients) {
                const cached = await getSharedSecret(r.bondId);
                if (cached) {
                  recipientKeys.push({ userId: r.userId, bondId: r.bondId, sharedSecret: cached.sharedSecret });
                  continue;
                }

                const bondKey = await getBondKey(r.bondId);
                const bond = bondMap.get(r.bondId);
                if (!bondKey || !bond?.peerPublicKeyJwk) continue;

                const peerPub = await importPublicKey(JSON.parse(bond.peerPublicKeyJwk));
                const shared = await deriveSharedSecret(bondKey.privateKey, peerPub);
                recipientKeys.push({ userId: r.userId, bondId: r.bondId, sharedSecret: shared });
              }

              setEncryptionStatus({
                encrypted: recipientKeys.length > 0,
                totalRecipients: recipients.length,
                encryptedRecipients: recipientKeys.length,
              });

              if (recipientKeys.length > 0) {
                try {
                  const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
                  const personalKey = await getOrCreateJournalKey();
                  recipientKeys.push({ userId: user!.id, bondId: undefined, sharedSecret: personalKey });
                } catch {
                  console.warn('[ComposeBox] Could not add self-grant');
                }

                const { encryptPostForRecipients } = await import('@/lib/crypto/post-encryption');
                const { toBase64 } = await import('@/lib/crypto/encoding');
                const result = await encryptPostForRecipients(content.trim(), recipientKeys);

                encryption = {
                  ciphertextBase64: toBase64(result.ciphertext),
                  iv: result.iv,
                  keyGrants: result.keyGrants,
                };
                imageEncryptionKey = result.postKey;
              }
            } else {
              setEncryptionStatus({ encrypted: false, totalRecipients: 0, encryptedRecipients: 0 });
            }
          } catch (encErr) {
            console.error('[ComposeBox] Encryption failed:', encErr);
            setEncryptionStatus({ encrypted: false, totalRecipients: 0, encryptedRecipients: 0 });
            toast({
              variant: 'destructive',
              title: 'Encryption Error',
              description: 'Could not encrypt this post. It will be stored unencrypted.',
            });
          }
        }

        // Upload images — encrypt if we have an encryption key
        let finalImageUrls: string[] = [];
        if (imageFiles.length > 0) {
          try {
            const uploadPromises = imageFiles.map(async (file) => {
              if (imageEncryptionKey) {
                // Encrypted upload — returns fileId (no public URL)
                const result = await uploadFile(file, 'posts', {
                  context: 'encrypted-post-image',
                  encryptionKey: imageEncryptionKey,
                });
                return result.fileId;
              }
              // Unencrypted upload — returns CDN URL
              return await uploadFile(file, 'posts', 'public-tribe-post');
            });
            finalImageUrls = await Promise.all(uploadPromises);
          } catch (uploadErr) {
            console.error('[ComposeBox] Image upload failed:', uploadErr);
            throw new Error(uploadErr instanceof Error ? uploadErr.message : 'Failed to upload images.');
          }
        }

        const result = await createRingPost({
          content: content.trim(),
          ring,
          moodTag: moodTag ?? undefined,
          imageUrls: finalImageUrls.length > 0 ? finalImageUrls : undefined,
          imageUrl: finalImageUrls.length > 0 ? finalImageUrls[0] : undefined,
          tribeIds: ring === 'tribes' ? selectedTribeIds : undefined,
          overrideName: selectedIdentity?.name,
          overrideAvatar: selectedIdentity?.avatar,
          encryption,
          linkPreview: linkPreview ?? undefined,
        });

        if (result && 'serverError' in result) {
          throw result;
        }

        triggerHaptic(ImpactStyle.Medium);

        // Cleanup object URLs
        previewUrls.forEach(url => URL.revokeObjectURL(url));

        // Reset
        setContent('');
        setMoodTag(null);
        setImageFiles([]);
        setPreviewUrls([]);
        setIsExpanded(false);
        setLinkPreview(null);
        setLinkDismissed(false);
        lastUnfurledUrl.current = null;

        toast({
          title: encryption ? 'Posted (encrypted)' : 'Posted!',
          description: ring === 'journal'
            ? 'Added to your journal.'
            : `Shared with your ${ring === 'inner_circle' ? 'Inner Circle' : ring === 'my_people' ? 'People' : 'Tribes'}.`,
        });

        onPostCreated?.();
      } catch (err) {
        handleError(err, "Post failed");
      }
    });
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const role = user?.role || 'Human_Free';
    const limit = IMAGE_LIMITS[role] || 1;

    if (imageFiles.length + files.length > limit) {
      toast({
        variant: 'destructive',
        title: 'Limit reached',
        description: `Your membership (${role}) allows up to ${limit} images per post.`,
      });
      return;
    }

    // Normalize images: convert HEIC/HEIF→JPEG, compress large files (runs in Web Worker)
    const { normalizeImage } = await import('@/lib/image-utils');
    const normalized = await Promise.all(files.map(f => normalizeImage(f)));

    const newPreviewUrls = normalized.map(file => URL.createObjectURL(file));
    setImageFiles(prev => [...prev, ...normalized]);
    setPreviewUrls(prev => [...prev, ...newPreviewUrls]);
  };

  const removeImage = (index: number) => {
    URL.revokeObjectURL(previewUrls[index]);
    setImageFiles(prev => prev.filter((_, i) => i !== index));
    setPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const insertImageRef = (index: number) => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const token = `[img:${index + 1}]`;
    const pos = textarea.selectionStart ?? content.length;
    const before = content.slice(0, pos);
    const after = content.slice(pos);
    // Add newlines around the token if not already at a line boundary
    const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
    const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
    const newContent = `${before}${prefix}${token}${suffix}${after}`;
    setContent(newContent);
    // Move cursor after the token
    const newPos = before.length + prefix.length + token.length;
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = newPos;
      textarea.focus();
    }, 0);
  };

  return (
    <Card ref={cardRef} className={cn("overflow-visible border-none shadow-sm bg-card/50 backdrop-blur-sm", className)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex gap-3 sm:gap-4">
          <div className="flex flex-col items-center gap-1">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="group relative focus:outline-none" aria-label="Select identity">
                  <UserAvatar 
                    user={composeUser} 
                    className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 cursor-pointer ring-2 ring-transparent group-hover:ring-primary/30 transition-all shadow-sm" 
                  />
                  <div className="absolute -bottom-1 -right-1 bg-background rounded-full border shadow-sm p-0.5">
                    <ChevronDown className="h-2 w-2 text-muted-foreground" />
                  </div>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 px-2 py-1">Identity Selection</DropdownMenuLabel>
                <DropdownMenuItem 
                  className={cn("flex items-center gap-2 cursor-pointer", !selectedIdentity && "bg-accent")}
                  onClick={() => setSelectedIdentity(null)}
                >
                  <UserAvatar user={defaultIdentity} className="h-6 w-6" />
                  <div className="flex flex-col">
                    <span className="text-xs font-medium">Auto (Default)</span>
                    <span className="text-[10px] text-muted-foreground truncate max-w-[140px]">{defaultIdentity.name}</span>
                  </div>
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  className={cn("flex items-center gap-2 cursor-pointer", selectedIdentity?.name === user?.name && "bg-accent")}
                  onClick={() => setSelectedIdentity({ name: user?.name || 'Unknown', avatar: user?.avatar || undefined })}
                >
                  <UserAvatar user={{ name: user?.name || '', avatar: user?.avatar || undefined }} className="h-6 w-6" />
                  <span className="text-xs">Main Profile</span>
                </DropdownMenuItem>

                {user?.reservedAlias && (
                  <DropdownMenuItem 
                    className={cn("flex items-center gap-2 cursor-pointer", selectedIdentity?.name === user.reservedAlias && "bg-accent")}
                    onClick={() => setSelectedIdentity({ name: user.reservedAlias!, avatar: user.reservedAliasAvatar })}
                  >
                    <UserAvatar user={{ name: user.reservedAlias, avatar: user.reservedAliasAvatar }} className="h-6 w-6" />
                    <span className="text-xs font-medium text-primary">{user.reservedAlias}</span>
                  </DropdownMenuItem>
                )}

                {user?.aliases && user.aliases.length > 0 && user.aliases.map((alias) => (
                  <DropdownMenuItem 
                    key={alias.name}
                    className={cn("flex items-center gap-2 cursor-pointer", selectedIdentity?.name === alias.name && "bg-accent")}
                    onClick={() => setSelectedIdentity({ name: alias.name, avatar: alias.avatar })}
                  >
                    <UserAvatar user={alias} className="h-6 w-6" />
                    <span className="text-xs">{alias.name}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {selectedIdentity && (
              <span className="text-[8px] font-bold text-primary uppercase tracking-tighter">Alias</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            {!isExpanded ? (
              /* Collapsed state — click to expand */
              <button
                onClick={() => {
                  setIsExpanded(true);
                  setTimeout(() => focusAndScroll(), 50);
                }}
                className="w-full text-left text-sm text-muted-foreground bg-muted/40 hover:bg-muted/60 rounded-lg px-3 py-2.5 transition-colors"
              >
                What do you have to share?
              </button>
            ) : (
              /* Expanded state — full compose form */
              <div className="space-y-2.5">
                <div className="relative z-10">
                  <Textarea
                    ref={textareaRef}
                    value={content}
                    onChange={(e) => {
                      setContent(e.target.value);
                      checkMention(e.target.value, e.target.selectionStart);
                      checkEmoji(e.target.value, e.target.selectionStart);
                    }}
                    onKeyDown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && (content.trim() || imageFiles.length > 0) && !isPending && !(ring === 'tribes' && selectedTribeIds.length === 0)) {
                        e.preventDefault();
                        handleSubmit();
                        return;
                      }
                      handleMentionKeyDown(e);
                      handleEmojiKeyDown(e);
                    }}
                    onSelect={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      checkMention(target.value, target.selectionStart);
                      checkEmoji(target.value, target.selectionStart);
                    }}
                    placeholder={
                      ring === 'journal'
                        ? 'Write in your journal...'
                        : ring === 'inner_circle'
                          ? 'Share with your Inner Circle...'
                          : ring === 'my_people'
                            ? 'Share with your People...'
                            : 'Share with your Tribes...'
                    }
                    className="min-h-[80px] text-sm border-0 p-0 resize-none focus-visible:ring-0 shadow-none bg-transparent w-full"
                    autoFocus
                  />
                  <MentionAutocomplete
                    ref={mentionRef}
                    query={mentionQuery}
                    onSelect={handleSelectMention}
                  />
                  <EmojiAutocomplete
                    ref={emojiRef}
                    query={emojiQuery}
                    onSelect={handleSelectEmoji}
                  />
                </div>

                {/* Image previews */}
                {previewUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
                    {previewUrls.map((url, idx) => (
                      <div key={idx} className="relative group hover:z-10">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Preview ${idx}`} className="h-20 w-20 rounded-md object-cover border shadow-sm" />
                        {/* Insert inline ref at cursor */}
                        <button
                          onClick={() => insertImageRef(idx)}
                          className="absolute bottom-0.5 left-0.5 bg-primary text-primary-foreground rounded-full h-5 w-5 flex items-center justify-center text-[10px] shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                          title={`Insert [img:${idx + 1}] at cursor`}
                        >
                          <Link2 className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-[10px] shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                        {/* Image index badge */}
                        <span className="absolute top-0.5 left-0.5 bg-black/60 text-white text-[9px] font-bold rounded px-1 py-0.5 leading-none">
                          {idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Link preview */}
                {isUnfurling && (
                  <LinkPreviewSkeleton />
                )}
                {linkPreview && !isUnfurling && (
                  <LinkPreviewCard
                    url={linkPreview.url}
                    title={linkPreview.title}
                    description={linkPreview.description}
                    imageUrl={linkPreview.imageUrl}
                    siteName={linkPreview.siteName}
                    compact
                    onDismiss={() => {
                      setLinkPreview(null);
                      setLinkDismissed(true);
                    }}
                  />
                )
                }

                {/* Controls bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex flex-wrap items-center gap-1">
                    <RingSelector
                      value={ring}
                      onChange={setRing}
                      selectedTribeIds={selectedTribeIds}
                      onTribeIdsChange={setSelectedTribeIds}
                      onTribesLoaded={setLoadedTribes}
                      defaultTribeId={defaultTribeId}
                    />
                    
                    {(() => {
                      let allowedMoods: string[] | undefined = undefined;
                      if (ring === 'tribes' && activeTribe) {
                        if (activeTribe.moods) {
                          allowedMoods = activeTribe.moods;
                        }
                      }
                      return <MoodTagSelector value={moodTag} onChange={setMoodTag} allowedMoods={allowedMoods} />;
                    })()}


                    {/* Image upload */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={previewUrls.length >= (IMAGE_LIMITS[user?.role || 'Human_Free'] || 1)}
                      />
                      <div className={cn(
                        "h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors",
                        previewUrls.length >= (IMAGE_LIMITS[user?.role || 'Human_Free'] || 1) && "opacity-40 cursor-not-allowed"
                      )}>
                        <ImagePlus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </label>
                    {previewUrls.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {previewUrls.length}/{IMAGE_LIMITS[user?.role || 'Human_Free'] || 1}
                      </span>
                    )}

                    {/* Encryption indicator */}
                    {ring === 'journal' ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium" title="Journal entries are encrypted with your personal key">
                        <Lock className="h-3 w-3" /> Private
                      </span>
                    ) : ring === 'inner_circle' || ring === 'my_people' ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium" title="End-to-end encrypted for your bonds">
                        <Lock className="h-3 w-3" /> E2E
                      </span>
                    ) : ring === 'tribes' && activeTribe && !activeTribe.isPublic ? (
                      <span className="flex items-center gap-0.5 text-[10px] text-green-600 font-medium" title="Private tribe — end-to-end encrypted">
                        <Lock className="h-3 w-3" /> E2E
                      </span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground font-medium" title="Public tribe posts are not encrypted">
                        <Globe className="h-3 w-3" /> Public
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => {
                        setIsExpanded(false);
                        setContent('');
                        setMoodTag(null);
                        previewUrls.forEach(url => URL.revokeObjectURL(url));
                        setImageFiles([]);
                        setPreviewUrls([]);
                        setLinkPreview(null);
                        setLinkDismissed(false);
                        lastUnfurledUrl.current = null;
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="text-xs h-8 gap-1"
                      disabled={(!content.trim() && imageFiles.length === 0) || isPending || (ring === 'tribes' && selectedTribeIds.length === 0)}
                      onClick={handleSubmit}
                    >
                      {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Send className="h-3 w-3" />
                      )}
                      Post
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
