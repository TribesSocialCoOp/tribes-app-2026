'use client';

import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Pencil, Loader2, Lock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from '@/hooks/use-toast';
import type { TribePost } from '@/lib/types';
import { editPost, editEncryptedPost, getPostKeyGrants } from '@/lib/actions/content-actions';
import { decryptPost, reEncryptPost, unwrapPostKey } from '@/lib/crypto/post-encryption';
import { getOrCreateJournalKey } from '@/lib/crypto/journal-encryption';
import { fromBase64 } from '@/lib/crypto/encoding';

const postSchema = z.object({
  content: z.string().min(1, 'Post content cannot be empty.').max(5000, 'Post is too long.'),
});

type PostFormValues = z.infer<typeof postSchema>;

interface EditPostDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: TribePost | null;
  onSuccess: () => void;
}

export function EditPostDialog({ open, onOpenChange, post, onSuccess }: EditPostDialogProps) {
  const { toast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [postKey, setPostKey] = useState<CryptoKey | null>(null);
  const [decryptionError, setDecryptionError] = useState<string | null>(null);

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      content: '',
    },
  });

  // Handle decryption when dialog opens for an encrypted post
  useEffect(() => {
    if (open && post) {
      if (post.isEncrypted) {
        handleDecryptPost(post);
      } else {
        form.reset({ content: post.content });
        setDecryptionError(null);
        setPostKey(null);
      }
    }
  }, [open, post, form]);

  const handleDecryptPost = async (encryptedPost: TribePost) => {
    setIsDecrypting(true);
    setDecryptionError(null);
    try {
      // 1. Fetch self-grant
      const grants = await getPostKeyGrants([encryptedPost.id]);
      const selfGrant = grants[encryptedPost.id];
      
      if (!selfGrant) {
        throw new Error('Encryption key not found for this post.');
      }

      // 2. Get author's journal key (used to wrap self-grants)
      const journalKey = await getOrCreateJournalKey();

      // 3. Unwrap post key
      const unwrappedKey = await unwrapPostKey(
        selfGrant.wrappedKey,
        selfGrant.wrapIv,
        journalKey
      );
      setPostKey(unwrappedKey);

      // 4. Decrypt content
      const ciphertext = fromBase64(encryptedPost.ciphertextBase64!);
      const plaintext = await decryptPost(
        ciphertext,
        encryptedPost.encryptionIv!,
        selfGrant.wrappedKey,
        selfGrant.wrapIv,
        journalKey
      );

      form.reset({ content: plaintext });
    } catch (err: any) {
      console.error('[EditPostDialog] Decryption failed:', err);
      setDecryptionError(err.message || 'Failed to decrypt post content.');
    } finally {
      setIsDecrypting(false);
    }
  };

  const onSubmit = async (values: PostFormValues) => {
    if (!post) return;
    setIsSubmitting(true);
    try {
      if (post.isEncrypted) {
        if (!postKey) throw new Error('Encryption key missing.');
        
        // Re-encrypt locally
        const { ciphertextBase64, iv } = await reEncryptPost(values.content, postKey);
        
        // Submit opaque blob to server
        await editEncryptedPost(post.id, ciphertextBase64, iv);
      } else {
        // Plaintext edit
        await editPost(post.id, values.content);
      }
      
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Pencil className="h-5 w-5 text-primary" />
            <span>Edit Post</span>
            {post?.isEncrypted && <Lock className="h-4 w-4 text-muted-foreground ml-2" />}
          </DialogTitle>
          <DialogDescription>
            {post?.isEncrypted 
              ? "This post is end-to-end encrypted. Your edits will be re-encrypted before leaving your device."
              : "Update your post content below."}
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
              You may need to sync your keys in Settings if you've recently cleared your browser data.
            </p>
            <Button variant="outline" size="sm" onClick={() => post && handleDecryptPost(post)}>
              Try Again
            </Button>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Content</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="What's on your mind?"
                        className="min-h-[200px] resize-none focus-visible:ring-primary/30"
                        {...field}
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <DialogFooter className="pt-4">
                <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
