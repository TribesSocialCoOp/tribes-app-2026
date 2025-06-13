
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader, DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription, DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader, SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription, SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from "@/hooks/use-mobile";
import type { TribePost } from '@/app/(app)/tribes/[tribeId]/page';
import { moodsData as allMoodsData } from '@/app/(app)/moods/page'; // Renamed to avoid conflict
import { Rss } from 'lucide-react';

interface PromotePostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  post: TribePost | null;
  onConfirmPromotion: (postId: string, selectedMoodSlugs: string[]) => void;
  tribeMoodSlugs: string[]; // New prop for tribe's associated mood slugs
}

export function PromotePostDialog({
  isOpen,
  onOpenChange,
  post,
  onConfirmPromotion,
  tribeMoodSlugs
}: PromotePostDialogProps) {
  const isMobile = useIsMobile();
  const [selectedMoodSlugsSet, setSelectedMoodSlugsSet] = useState<Set<string>>(new Set());

  const availableMoodsToDisplay = useMemo(() => {
    if (!tribeMoodSlugs || tribeMoodSlugs.length === 0) {
      return []; // Or allMoodsData if you want to show all as a fallback, though requirement is to limit
    }
    return allMoodsData.filter(mood => tribeMoodSlugs.includes(mood.slug));
  }, [tribeMoodSlugs]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedMoodSlugsSet(new Set());
    }
  }, [isOpen]);

  if (!post) {
    return null;
  }

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

  const DialogContentComponent = isMobile ? ShadSheetContent : ShadDialogContent;
  const DialogHeaderComponent = isMobile ? ShadSheetHeader : ShadDialogHeader;
  const DialogTitleComponent = isMobile ? ShadSheetTitle : ShadDialogTitle;
  const DialogDescriptionComponent = isMobile ? ShadSheetDescription : ShadDialogDescription;
  const DialogFooterComponent = isMobile ? ShadSheetFooter : ShadDialogFooter;
  const RootComponent = isMobile ? Sheet : Dialog;

  const commonContent = (
    <>
      <DialogHeaderComponent>
        <DialogTitleComponent className="flex items-center">
          <Rss className="mr-2 h-5 w-5 text-primary" /> Promote Post to Mood Streams
        </DialogTitleComponent>
        <DialogDescriptionComponent>
          Select relevant mood streams for the post: <span className="italic font-semibold">"{post.title || 'this post'}"</span>. Only moods associated with this tribe are shown.
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

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

      <DialogFooterComponent className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={selectedMoodSlugsSet.size === 0 || availableMoodsToDisplay.length === 0}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Confirm Promotion ({selectedMoodSlugsSet.size})
        </Button>
      </DialogFooterComponent>
    </>
  );

  if (isMobile) {
    return (
      <RootComponent open={isOpen} onOpenChange={onOpenChange}>
        <DialogContentComponent side="bottom" className="h-auto max-h-[90vh] flex flex-col p-0">
          <ScrollArea className="flex-1">
            <div className="p-4 sm:p-6">
              {commonContent}
            </div>
          </ScrollArea>
        </DialogContentComponent>
      </RootComponent>
    );
  }

  return (
    <RootComponent open={isOpen} onOpenChange={onOpenChange}>
      <DialogContentComponent className="sm:max-w-lg p-6">
        {commonContent}
      </DialogContentComponent>
    </RootComponent>
  );
}
