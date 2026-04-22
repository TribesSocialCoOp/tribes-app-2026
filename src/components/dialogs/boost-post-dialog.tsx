
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import type { TribePost } from '@/lib/types';
import { moodsData as allMoodsData } from '@/lib/moods-data';
import { Rss } from 'lucide-react';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

interface PromotePostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  post: TribePost | null;
  onConfirmPromotion: (postId: string, selectedMoodSlugs: string[]) => void;
  tribeMoodSlugs: string[];
}

export function PromotePostDialog({
  isOpen,
  onOpenChange,
  post,
  onConfirmPromotion,
  tribeMoodSlugs
}: PromotePostDialogProps) {
  const [selectedMoodSlugsSet, setSelectedMoodSlugsSet] = useState<Set<string>>(new Set());

  const availableMoodsToDisplay = useMemo(() => {
    if (!tribeMoodSlugs || tribeMoodSlugs.length === 0) return [];
    return allMoodsData.filter(mood => tribeMoodSlugs.includes(mood.slug));
  }, [tribeMoodSlugs]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedMoodSlugsSet(new Set());
    }
  }, [isOpen]);

  if (!post) return null;

  const handleMoodSelectionChange = (moodSlug: string, checked: boolean | "indeterminate") => {
    setSelectedMoodSlugsSet(prev => {
      const newSlugs = new Set(prev);
      if (checked) {
        newSlugs.add(moodSlug);
      } else {
        newSlugs.delete(moodSlug);
      }
      return newSlugs;
    });
  };

  const handleConfirm = () => {
    onConfirmPromotion(post.id, Array.from(selectedMoodSlugsSet));
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center">
          <Rss className="mr-2 h-5 w-5 text-primary" /> Promote Post to Mood Streams
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Select relevant mood streams for the post: <span className="italic font-semibold">"{post.title || 'this post'}"</span>. Only moods associated with this tribe are shown.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="py-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground mb-1">Post Preview:</p>
          <div className="p-3 border rounded-md bg-muted/50 max-h-24 overflow-y-auto text-xs text-muted-foreground">
            <p className="line-clamp-3">{post.content}</p>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium text-foreground">Select Moods:</Label>
          {availableMoodsToDisplay.length > 0 ? (
            <>
              <p className="text-xs text-muted-foreground mb-2">Choose one or more moods to promote this post to.</p>
              <ScrollArea className="h-[200px] sm:h-[250px] pr-3 border rounded-md p-3">
                <div className="space-y-2">
                  {availableMoodsToDisplay.map(mood => (
                    <div key={mood.slug} className="flex items-center space-x-2">
                      <Checkbox
                        id={`promote-mood-${mood.slug}`}
                        checked={selectedMoodSlugsSet.has(mood.slug)}
                        onCheckedChange={(checked) => handleMoodSelectionChange(mood.slug, checked)}
                      />
                      <Label htmlFor={`promote-mood-${mood.slug}`} className="text-sm font-normal cursor-pointer flex items-center">
                        <span className="mr-1.5 text-base">{mood.emoji}</span> {mood.name}
                      </Label>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          ) : (
            <p className="text-sm text-muted-foreground p-3 border rounded-md bg-muted/50 text-center">
              This tribe is not associated with any moods. Add moods to the tribe to enable promotion.
            </p>
          )}
        </div>
      </div>

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={selectedMoodSlugsSet.size === 0 || availableMoodsToDisplay.length === 0}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Confirm Promotion ({selectedMoodSlugsSet.size})
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
