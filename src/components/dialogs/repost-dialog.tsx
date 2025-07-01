
"use client";

import React, { useState, useEffect } from 'react';
import {
  Dialog, DialogContent as ShadDialogContent, DialogHeader as ShadDialogHeader, DialogTitle as ShadDialogTitle, DialogDescription as ShadDialogDescription, DialogFooter as ShadDialogFooter
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent as ShadSheetContent, SheetHeader as ShadSheetHeader, SheetTitle as ShadSheetTitle, SheetDescription as ShadSheetDescription, SheetFooter as ShadSheetFooter
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { useIsMobile } from "@/hooks/use-mobile";
import type { TribePost } from '@/lib/data';
import { RefreshCcw } from 'lucide-react';

interface RepostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  postToRepost: TribePost | null;
  onConfirmRepost: (editedContent: string, originalPostTitle?: string) => void;
}

export function RepostDialog({
  isOpen,
  onOpenChange,
  postToRepost,
  onConfirmRepost
}: RepostDialogProps) {
  const isMobile = useIsMobile();
  const [editedContent, setEditedContent] = useState("");

  useEffect(() => {
    if (isOpen && postToRepost) {
      setEditedContent(postToRepost.content);
    } else if (!isOpen) {
      setEditedContent(""); // Reset when dialog closes
    }
  }, [isOpen, postToRepost]);

  if (!postToRepost) {
    return null;
  }

  const handleConfirm = () => {
    onConfirmRepost(editedContent, postToRepost.title);
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
          <RefreshCcw className="mr-2 h-5 w-5 text-primary" /> Repost Content
        </DialogTitleComponent>
        <DialogDescriptionComponent>
          Review and edit the content before reposting. Original title: "<span className="italic font-semibold">{postToRepost.title || "Untitled Post"}</span>".
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

      <div className="py-4 space-y-4">
        <div>
          <Label htmlFor="repost-content" className="text-sm font-medium text-foreground">
            Edit Content for Repost:
          </Label>
          <Textarea
            id="repost-content"
            value={editedContent}
            onChange={(e) => setEditedContent(e.target.value)}
            placeholder="Edit the post content here..."
            className="mt-1 min-h-[150px] text-sm"
          />
           <p className="text-xs text-muted-foreground mt-1 px-1">
            Make any necessary corrections or updates.
          </p>
        </div>
      </div>

      <DialogFooterComponent className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          disabled={editedContent.trim().length < 5} // Basic validation
        >
          Confirm Repost
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
