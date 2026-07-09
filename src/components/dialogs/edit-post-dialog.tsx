'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Pencil, Loader2, Lock, ImagePlus, X, Type } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { MoodTagSelector } from '@/components/compose/mood-tag-selector';
import type { TribePost } from '@/lib/types';
import { editPost, editEncryptedPost, getPostKeyGrants } from '@/lib/actions/content-actions';
import type { EditPostPayload } from '@/lib/actions/content-actions';
import { reEncryptPost } from '@/lib/crypto/post-encryption';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';

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

interface EditPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: TribePost | null;
  onSuccess: () => void;
}

export function EditPostDialog({ open, onOpenChange, post, onSuccess }: EditPostDialogProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [postKey, setPostKey] = useState<CryptoKey | null>(null);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  // Form state
  const [content, setContent] = useState('');
  const [title, setTitle] = useState('');
  const [showTitle, setShowTitle] = useState(false);
  const [moodTag, setMoodTag] = useState<string | null>(null);

  // Image state
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<File[]>([]);
  const [newPreviewUrls, setNewPreviewUrls] = useState<string[]>([]);

  // Reset form when dialog opens with a post
  useEffect(() => {
    if (open && post) {
      if (post.isEncrypted) {
        // Decrypts the body AND (if present) the encrypted title
        handleDecryptPost(post);
      } else {
        setContent(post.content || '');
        setDecryptionError(null);
        setPostKey(null);
        // Plaintext title lives on the row for unencrypted posts
        setTitle(post.title || '');
        setShowTitle(!!post.title);
      }

      setMoodTag(post.moodTag || null);

      // Populate existing images
      const imgs: string[] = [];
      if (post.imageUrls && post.imageUrls.length > 0) {
        imgs.push(...post.imageUrls);
      } else if (post.imageUrl) {
        imgs.push(post.imageUrl);
      }
      setExistingImageUrls(imgs);
      setNewImageFiles([]);
      setNewPreviewUrls([]);
    }
  }, [open, post, user?.id]);

  const handleDecryptPost = async (encryptedPost: TribePost) => {
    setIsDecrypting(true);
    setDecryptionError(null);
    try {
      const { fromBase64 } = await import('@/lib/crypto/encoding');
      const ciphertext = fromBase64(encryptedPost.ciphertextBase64!);
      let decryptionKey: CryptoKey;

      // ── Tribe group key path ──────────────────────────────────────
      // Private tribe posts are encrypted with the tribe's AES-256-GCM
      // group key — not per-bond key grants.
      if (encryptedPost.ring === 'tribes' && encryptedPost.tribeId) {
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const storedKey = user?.id ? await getTribeKey(user.id, encryptedPost.tribeId) : null;
        if (!storedKey) {
          throw new Error('Tribe encryption key not found. You may need to sync your keys in Settings.');
        }
        decryptionKey = storedKey.key;

        const { decryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
        setPostKey(decryptionKey);
        const plaintext = await decryptWithTribeKey(ciphertext, encryptedPost.encryptionIv!, decryptionKey);
        setContent(plaintext);
        if (encryptedPost.titleCiphertextBase64 && encryptedPost.titleIv) {
          const titlePlain = await decryptWithTribeKey(fromBase64(encryptedPost.titleCiphertextBase64), encryptedPost.titleIv, decryptionKey);
          setTitle(titlePlain);
          setShowTitle(!!titlePlain);
        } else {
          setTitle('');
          setShowTitle(false);
        }
        return;
      }

      // ── Bond / Journal key grant path ─────────────────────────────
      const grants = await getPostKeyGrants([encryptedPost.id]);
      const grant = grants[encryptedPost.id];
      
      if (!grant) {
        throw new Error('Encryption key not found for this post.');
      }

      const { decryptWithPostKey } = await import('@/lib/crypto/post-encryption');
      
      if (!grant.bondId) {
        // Self-grant: wrapped with the author's personal journal key
        const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
        const { unwrapPostKey } = await import('@/lib/crypto/post-encryption');
        const journalKey = await getOrCreateJournalKey();
        decryptionKey = await unwrapPostKey(grant.wrappedKey, grant.wrapIv, journalKey);
      } else {
        // Bond grant: use rotation-aware resolver (Phase 1)
        const { resolvePostKeyForGrant } = await import('@/lib/crypto/key-rotation');
        const resolved = await resolvePostKeyForGrant(grant.bondId, grant.wrappedKey, grant.wrapIv);
        if (!resolved) throw new Error('Key mismatch or access denied (Sync keys in settings)');
        decryptionKey = resolved;
      }

      setPostKey(decryptionKey);
      const plaintext = await decryptWithPostKey(ciphertext, encryptedPost.encryptionIv!, decryptionKey);
      setContent(plaintext);
      if (encryptedPost.titleCiphertextBase64 && encryptedPost.titleIv) {
        const titlePlain = await decryptWithPostKey(fromBase64(encryptedPost.titleCiphertextBase64), encryptedPost.titleIv, decryptionKey);
        setTitle(titlePlain);
        setShowTitle(!!titlePlain);
      } else {
        setTitle('');
        setShowTitle(false);
      }
    } catch (err: any) {
      console.error('[EditPostDialog] Decryption failed:', err);
      setDecryptionError(err.message || 'Failed to decrypt post content.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const role = user?.role || 'Human_Free';
    const limit = IMAGE_LIMITS[role] || 1;
    const totalImages = existingImageUrls.length + newImageFiles.length + files.length;

    if (totalImages > limit) {
      toast({
        variant: 'destructive',
        title: 'Limit reached',
        description: `Your membership allows up to ${limit} images per post.`,
      });
      return;
    }

    // Normalize images: convert HEIC/HEIF→JPEG, compress large files
    const { normalizeImage } = await import('@/lib/image-utils');
    const normalizedFiles = await Promise.all(files.map(f => normalizeImage(f)));

    const previews = normalizedFiles.map(f => URL.createObjectURL(f));
    setNewImageFiles(prev => [...prev, ...normalizedFiles]);
    setNewPreviewUrls(prev => [...prev, ...previews]);

    // Reset the input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeExistingImage = (index: number) => {
    setExistingImageUrls(prev => prev.filter((_, i) => i !== index));
  };

  const removeNewImage = (index: number) => {
    URL.revokeObjectURL(newPreviewUrls[index]);
    setNewImageFiles(prev => prev.filter((_, i) => i !== index));
    setNewPreviewUrls(prev => prev.filter((_, i) => i !== index));
  };

  const onSubmit = async () => {
    if (!post || !content.trim()) return;
    setIsSubmitting(true);
    try {
      // Upload new images first
      const uploadedUrls: string[] = [];
      for (const file of newImageFiles) {
        if (post.isEncrypted && postKey) {
          // Encrypted upload
          const result = await uploadFile(file, 'posts', {
            context: 'encrypted-post-image',
            encryptionKey: postKey,
          });
          uploadedUrls.push(result.fileId);
        } else {
          // Unencrypted upload
          const url = await uploadFile(file, 'posts', 'public-tribe-post');
          uploadedUrls.push(url as string);
        }
      }

      // Combine existing + newly uploaded
      const allImageUrls = [...existingImageUrls, ...uploadedUrls];

      const trimmedTitle = showTitle && title.trim() ? title.trim() : null;
      const baseMetadata = {
        imageUrl: allImageUrls.length > 0 ? allImageUrls[0] : null,
        imageUrls: allImageUrls.length > 0 ? allImageUrls : null,
        moodTag: moodTag,
      };

      if (post.isEncrypted) {
        if (!postKey) throw new Error('Encryption key missing.');

        // Re-encrypt content locally
        const { ciphertextBase64, iv } = await reEncryptPost(content, postKey);

        // Encrypt the title with the same post key (its own IV); null clears it
        let titleCiphertextBase64: string | null = null;
        let titleIv: string | null = null;
        if (trimmedTitle) {
          const enc = await reEncryptPost(trimmedTitle, postKey);
          titleCiphertextBase64 = enc.ciphertextBase64;
          titleIv = enc.iv;
        }

        // Submit encrypted content + unencrypted metadata + encrypted title
        await editEncryptedPost(post.id, ciphertextBase64, iv, {
          ...baseMetadata,
          titleCiphertextBase64,
          titleIv,
        });
      } else {
        // Plaintext edit with full payload (title stays plaintext for public posts)
        const payload: EditPostPayload = {
          content,
          ...baseMetadata,
          title: trimmedTitle,
        };
        await editPost(post.id, payload);
      }
      
      // Cleanup object URLs
      newPreviewUrls.forEach(url => URL.revokeObjectURL(url));

      toast({ title: 'Post Updated', description: 'Your changes have been saved.' });
      onOpenChange(false);
      onSuccess();
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Update Failed',
        description: err.message || 'An error occurred while saving your changes.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalImageCount = existingImageUrls.length + newImageFiles.length;
  const role = user?.role || 'Human_Free';
  const imageLimit = IMAGE_LIMITS[role] || 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Pencil className="h-5 w-5 text-primary" />
            <span>Edit Post</span>
            {post?.isEncrypted && <Lock className="h-4 w-4 text-muted-foreground ml-2" />}
          </DialogTitle>
          <DialogDescription>
            {post?.isEncrypted 
              ? "Encrypted post — your edits will be re-encrypted locally. Metadata (title, mood, images) remains unencrypted."
              : "Update your post content, images, and mood below."}
          </DialogDescription>
        </DialogHeader>

        {isDecrypting ? (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Decrypting post content...</p>
          </div>
        ) : decryptionError ? (
          <div className="bg-destructive/10 p-6 rounded-lg border border-destructive/20 text-center space-y-3">
            <Lock className="h-8 w-8 text-destructive mx-auto" />
            <p className="text-sm font-medium text-destructive">{decryptionError}</p>
            <p className="text-xs text-muted-foreground">
              You may need to sync your keys in Settings if you&apos;ve recently cleared your browser data.
            </p>
            <Button variant="outline" size="sm" onClick={() => post && handleDecryptPost(post)}>
              Try Again
            </Button>
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Title field (collapsible) */}
            {!showTitle ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground h-8"
                onClick={() => setShowTitle(true)}
              >
                <Type className="h-3.5 w-3.5" />
                Add Title
              </Button>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="edit-title" className="text-xs font-medium text-muted-foreground">Title</Label>
                  <button
                    type="button"
                    onClick={() => { setShowTitle(false); setTitle(''); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Remove
                  </button>
                </div>
                <Input
                  id="edit-title"
                  placeholder="Post title (optional)"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  disabled={isSubmitting}
                  className="h-9 text-sm"
                />
              </div>
            )}

            {/* Content textarea */}
            <div className="space-y-1.5">
              <Label htmlFor="edit-content" className="text-xs font-medium text-muted-foreground">Content</Label>
              <Textarea
                id="edit-content"
                placeholder="What's on your mind?"
                className="min-h-[160px] resize-none focus-visible:ring-primary/30"
                value={content}
                onChange={e => setContent(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && content.trim() && !isSubmitting) {
                    e.preventDefault();
                    onSubmit();
                  }
                }}
                disabled={isSubmitting}
              />
            </div>

            {/* Image previews grid */}
            {(existingImageUrls.length > 0 || newPreviewUrls.length > 0) && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium text-muted-foreground">
                  Images ({totalImageCount}/{imageLimit})
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {existingImageUrls.map((url, i) => (
                    <div key={`existing-${i}`} className="relative group aspect-square rounded-lg overflow-hidden border border-border/50">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removeExistingImage(i)}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  {newPreviewUrls.map((url, i) => (
                    <div key={`new-${i}`} className="relative group aspect-square rounded-lg overflow-hidden border-2 border-dashed border-primary/30">
                      <img src={url} alt="" className="w-full h-full object-cover" />
                      <div className="absolute top-1 left-1 bg-primary/80 text-primary-foreground text-[9px] font-bold px-1.5 py-0.5 rounded-full">NEW</div>
                      <button
                        type="button"
                        onClick={() => removeNewImage(i)}
                        className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Toolbar row: mood + add image */}
            <div className="flex items-center gap-2 border-t border-border/50 pt-3">
              <MoodTagSelector value={moodTag} onChange={setMoodTag} />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                id="edit-image-upload"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs h-8 text-muted-foreground"
                onClick={() => fileInputRef.current?.click()}
                disabled={isSubmitting || totalImageCount >= imageLimit}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {totalImageCount > 0 ? 'More' : 'Image'}
              </Button>
            </div>

            {/* Footer */}
            <DialogFooter className="pt-2">
              <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button onClick={onSubmit} disabled={isSubmitting || !content.trim()}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
