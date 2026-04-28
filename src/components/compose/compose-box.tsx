"use client";

import React, { useState, useRef, useTransition } from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { RingSelector } from './ring-selector';
import { MoodTagSelector } from './mood-tag-selector';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { createRingPost, type CreateRingPostPayload } from '@/lib/actions/content-actions';
import type { Ring } from '@/lib/types';
import { ImagePlus, Send, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActionError } from '@/hooks/use-action-error';

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
  const [isPending, startTransition] = useTransition();
  const [isExpanded, setIsExpanded] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Ring state
  const savedRing = typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) as Ring | null : null;
  const [ring, setRing] = useState<Ring>(defaultRing ?? savedRing ?? 'my_people');
  const [selectedTribeIds, setSelectedTribeIds] = useState<string[]>(
    defaultTribeId ? [defaultTribeId] : []
  );

  // Content state
  const [content, setContent] = useState('');
  const [moodTag, setMoodTag] = useState<string | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);

  const initials = (user?.name ?? 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

  const handleSubmit = () => {
    if (!content.trim()) return;

    startTransition(async () => {
      try {
        let encryption: CreateRingPostPayload['encryption'] | undefined;

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
          } catch (encErr) {
            console.warn('[ComposeBox] Journal encryption failed, posting unencrypted:', encErr);
          }
        } else {
          // Rings: encrypt for bond recipients (sender key model)
          try {
            const { getEncryptionRecipients } = await import('@/lib/actions/content-actions');
            const recipients = await getEncryptionRecipients(
              ring as 'inner_circle' | 'my_people' | 'tribes',
              ring === 'tribes' ? selectedTribeIds : undefined,
            );

            if (recipients.length > 0) {
              // Derive shared secrets for each recipient
              const { getBondKey, importPublicKey, deriveSharedSecret } = await import('@/lib/crypto');
              const { getBonds } = await import('@/lib/actions/bond-actions');
              const allBonds = await getBonds();
              const bondMap = new Map(allBonds.map(b => [b.id, b]));

              const recipientKeys: Array<{
                userId: string;
                bondId?: string;
                sharedSecret: CryptoKey;
              }> = [];

              for (const r of recipients) {
                const bondKey = await getBondKey(r.bondId);
                const bond = bondMap.get(r.bondId);
                if (!bondKey || !bond?.peerPublicKeyJwk) continue;

                const peerPub = await importPublicKey(JSON.parse(bond.peerPublicKeyJwk));
                const shared = await deriveSharedSecret(bondKey.privateKey, peerPub);
                recipientKeys.push({ userId: r.userId, bondId: r.bondId, sharedSecret: shared });
              }

              if (recipientKeys.length > 0) {
                // Add author as a recipient so they can decrypt their own posts.
                // Uses the personal journal key as the wrapping secret (bondId = null).
                try {
                  const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
                  const personalKey = await getOrCreateJournalKey();
                  recipientKeys.push({
                    userId: user!.id,
                    bondId: undefined,  // No bond — self-grant
                    sharedSecret: personalKey,
                  });
                } catch {
                  console.warn('[ComposeBox] Could not add self-grant — author will not be able to decrypt own posts');
                }

                const { encryptPostForRecipients } = await import('@/lib/crypto/post-encryption');
                const { toBase64 } = await import('@/lib/crypto/encoding');
                const result = await encryptPostForRecipients(content.trim(), recipientKeys);

                encryption = {
                  ciphertextBase64: toBase64(result.ciphertext),
                  iv: result.iv,
                  keyGrants: result.keyGrants,
                };
              }
            }
          } catch (encErr) {
            console.warn('[ComposeBox] Encryption failed, posting unencrypted:', encErr);
            // Graceful degradation: post unencrypted if crypto fails
          }
        }

        await createRingPost({
          content: content.trim(),
          ring,
          moodTag: moodTag ?? undefined,
          imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
          // For backward compatibility, also send the first image to imageUrl
          imageUrl: imageUrls.length > 0 ? imageUrls[0] : undefined,
          tribeIds: ring === 'tribes' ? selectedTribeIds : undefined,
          encryption,
        });

        // Reset
        setContent('');
        setMoodTag(null);
        setImageUrls([]);
        setIsExpanded(false);

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

    if (imageUrls.length + files.length > limit) {
      toast({
        variant: 'destructive',
        title: 'Limit reached',
        description: `Your membership (${role}) allows up to ${limit} images per post.`,
      });
      return;
    }

    try {
      const uploadPromises = files.map(async (file) => {
        const { uploadFile } = await import('@/lib/upload');
        const url = await uploadFile(file, 'posts', 'public-tribe-post');
        return url as string;
      });

      const newUrls = await Promise.all(uploadPromises);
      setImageUrls(prev => [...prev, ...newUrls]);
    } catch {
      toast({ variant: 'destructive', title: 'Upload failed', description: 'Could not upload some images.' });
    }
  };

  const removeImage = (index: number) => {
    setImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <Card className={cn("overflow-hidden border-none shadow-sm bg-card/50 backdrop-blur-sm", className)}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex gap-3 sm:gap-4">
          <Avatar className="h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0">
            {user?.avatar && <AvatarImage src={user.avatar} alt={user?.name ?? 'You'} />}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            {!isExpanded ? (
              /* Collapsed state — click to expand */
              <button
                onClick={() => {
                  setIsExpanded(true);
                  setTimeout(() => textareaRef.current?.focus(), 50);
                }}
                className="w-full text-left text-sm text-muted-foreground bg-muted/40 hover:bg-muted/60 rounded-lg px-3 py-2.5 transition-colors"
              >
                What do you have to share?
              </button>
            ) : (
              /* Expanded state — full compose form */
              <div className="space-y-2.5">
                <Textarea
                  ref={textareaRef}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={
                    ring === 'journal'
                      ? 'Write in your journal...'
                      : ring === 'inner_circle'
                        ? 'Share with your Inner Circle...'
                        : ring === 'my_people'
                          ? 'Share with your People...'
                          : 'Share with your Tribes...'
                  }
                  className="min-h-[80px] text-sm border-0 p-0 resize-none focus-visible:ring-0 shadow-none bg-transparent"
                  autoFocus
                />

                {/* Image previews */}
                {imageUrls.length > 0 && (
                  <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
                    {imageUrls.map((url, idx) => (
                      <div key={idx} className="relative group">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={url} alt={`Preview ${idx}`} className="h-20 w-20 rounded-md object-cover border shadow-sm" />
                        <button
                          onClick={() => removeImage(idx)}
                          className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center text-[10px] shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Controls bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">
                  <div className="flex flex-wrap items-center gap-1">
                    <RingSelector
                      value={ring}
                      onChange={setRing}
                      selectedTribeIds={selectedTribeIds}
                      onTribeIdsChange={setSelectedTribeIds}
                      defaultTribeId={defaultTribeId}
                    />
                    <MoodTagSelector value={moodTag} onChange={setMoodTag} />

                    {/* Image upload */}
                    <label className="cursor-pointer">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleImageUpload}
                        disabled={imageUrls.length >= (IMAGE_LIMITS[user?.role || 'Human_Free'] || 1)}
                      />
                      <div className={cn(
                        "h-8 w-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors",
                        imageUrls.length >= (IMAGE_LIMITS[user?.role || 'Human_Free'] || 1) && "opacity-40 cursor-not-allowed"
                      )}>
                        <ImagePlus className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </label>
                    {imageUrls.length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-medium">
                        {imageUrls.length}/{IMAGE_LIMITS[user?.role || 'Human_Free'] || 1}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => {
                        setIsExpanded(false);
                        setContent('');
                        setMoodTag(null);
                        setImageUrls([]);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="text-xs h-8 gap-1"
                      disabled={!content.trim() || isPending || (ring === 'tribes' && selectedTribeIds.length === 0)}
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
