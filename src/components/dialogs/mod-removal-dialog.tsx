"use client";

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ShieldAlert, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const REMOVAL_REASONS = [
  { id: 'spam', label: 'Spam / Self-promotion', emoji: '🚫' },
  { id: 'harassment', label: 'Harassment / Hate speech', emoji: '⚠️' },
  { id: 'off_topic', label: 'Off-topic / Wrong tribe', emoji: '🔇' },
  { id: 'inappropriate', label: 'Inappropriate content', emoji: '🔞' },
  { id: 'rules', label: 'Violates tribe rules', emoji: '📋' },
  { id: 'other', label: 'Other', emoji: '✏️' },
] as const;

interface ModRemovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string, preventRepost: boolean) => Promise<void>;
  postTitle?: string;
}

export function ModRemovalDialog({ open, onOpenChange, onConfirm, postTitle }: ModRemovalDialogProps) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState('');
  const [preventRepost, setPreventRepost] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resolvedReason = selectedReason === 'other'
    ? customReason.trim()
    : REMOVAL_REASONS.find(r => r.id === selectedReason)?.label ?? '';

  const canSubmit = selectedReason !== null && resolvedReason.length > 0;

  const handleConfirm = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await onConfirm(resolvedReason, preventRepost);
      // Reset state on success
      setSelectedReason(null);
      setCustomReason('');
      setPreventRepost(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (value: boolean) => {
    if (!value) {
      setSelectedReason(null);
      setCustomReason('');
      setPreventRepost(false);
    }
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            Remove Post
          </DialogTitle>
          <DialogDescription>
            {postTitle
              ? `Select a reason for removing "${postTitle}".`
              : 'Select a reason for removing this post.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          {REMOVAL_REASONS.map((reason) => (
            <button
              key={reason.id}
              onClick={() => setSelectedReason(reason.id)}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-sm transition-colors",
                selectedReason === reason.id
                  ? "bg-destructive/10 text-destructive ring-1 ring-destructive/30 font-medium"
                  : "hover:bg-muted/60 text-foreground"
              )}
            >
              <span className="text-base">{reason.emoji}</span>
              <span>{reason.label}</span>
            </button>
          ))}

          {selectedReason === 'other' && (
            <Textarea
              value={customReason}
              onChange={(e) => setCustomReason(e.target.value)}
              placeholder="Describe the reason for removal..."
              className="mt-2 min-h-[80px] text-sm"
              autoFocus
            />
          )}
        </div>

        <div className="flex items-center space-x-2 border-t pt-3">
          <Checkbox
            id="prevent-repost"
            checked={preventRepost}
            onCheckedChange={(checked) => setPreventRepost(checked === true)}
          />
          <Label
            htmlFor="prevent-repost"
            className="text-xs text-muted-foreground cursor-pointer leading-tight"
          >
            Prevent author from reposting this content
          </Label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            disabled={!canSubmit || isSubmitting}
            onClick={handleConfirm}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
            ) : (
              <ShieldAlert className="h-4 w-4 mr-1.5" />
            )}
            Remove Post
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
