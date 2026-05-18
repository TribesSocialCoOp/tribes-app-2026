'use client';

import React, { useState, useEffect } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from '@/hooks/use-toast';
import type { TribePost } from '@/lib/types';
import { updatePostSlug } from '@/lib/actions/content-actions';

interface EditSlugDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  post: TribePost | null;
  tribeSlug?: string | null;
  onSuccess: (newSlug: string, slugEditedBy?: string | null) => void;
}

export function EditSlugDialog({
  open,
  onOpenChange,
  post,
  tribeSlug,
  onSuccess,
}: EditSlugDialogProps) {
  const { toast } = useToast();
  const [slug, setSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && post) {
      setSlug(post.slug || '');
      setError(null);
    }
  }, [open, post]);

  const validateSlug = (val: string): boolean => {
    if (!val) {
      setError("Slug cannot be empty.");
      return false;
    }
    if (val.length < 3) {
      setError("Slug must be at least 3 characters.");
      return false;
    }
    if (val.length > 80) {
      setError("Slug must be under 80 characters.");
      return false;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(val)) {
      setError("Slug can only contain alphanumeric characters, hyphens, and underscores.");
      return false;
    }
    setError(null);
    return true;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSlug(val);
    validateSlug(val);
  };

  const onSubmit = async () => {
    if (!post) return;
    if (!validateSlug(slug)) return;

    setIsSubmitting(true);
    try {
      const result = await updatePostSlug(post.id, slug);
      if (result.success) {
        toast({
          title: "URL Slug Updated",
          description: `The post's canonical URL is now active at its new slug.`,
        });
        onSuccess(result.newSlug, result.slugEditedBy);
        onOpenChange(false);
      }
    } catch (err: any) {
      console.error("[EditSlugDialog] Update failed:", err);
      toast({
        variant: 'destructive',
        title: 'Slug Update Failed',
        description: err.message || 'An error occurred while updating the slug.',
      });
      setError(err.message || 'Slug collision or invalid input.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const originUrl = typeof window !== 'undefined' ? window.location.origin : 'https://tribes.app';
  const prefix = tribeSlug ? `/t/${tribeSlug}/` : '/p/';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <Link2 className="h-5 w-5 text-primary" />
            <span>Edit URL Slug</span>
          </DialogTitle>
          <DialogDescription>
            Change the web address of your post. Previous URLs will automatically redirect to the new one.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="post-slug" className="text-sm font-medium">Post URL Path</Label>
            <div className="flex items-center">
              <span className="text-sm text-muted-foreground bg-muted border border-r-0 rounded-l-md px-3 py-2 select-none h-10 flex items-center font-mono">
                {originUrl}{prefix}
              </span>
              <Input
                id="post-slug"
                placeholder="custom-post-slug"
                value={slug}
                onChange={handleChange}
                disabled={isSubmitting}
                className="rounded-l-none text-base h-10 font-mono"
              />
            </div>
            {error ? (
              <p className="text-xs text-destructive font-medium">{error}</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Only letters, numbers, hyphens, and underscores are allowed.
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="ghost" type="button" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={isSubmitting || !!error || !slug.trim() || slug === post?.slug}>
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Slug
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
