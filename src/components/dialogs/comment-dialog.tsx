
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
import { MessageSquareText, Send } from 'lucide-react';

interface CommentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmComment: (content: string) => void;
  postTitle?: string;
  parentAuthorName?: string;
}

export function CommentDialog({
  isOpen,
  onOpenChange,
  onConfirmComment,
  postTitle,
  parentAuthorName
}: CommentDialogProps) {
  const isMobile = useIsMobile();
  const [content, setContent] = useState("");

  useEffect(() => {
    if (!isOpen) {
      setContent(""); // Reset when dialog closes
    }
  }, [isOpen]);

  const handleConfirm = () => {
    onConfirmComment(content);
    onOpenChange(false);
  };

  const DialogContentComponent = isMobile ? ShadSheetContent : ShadDialogContent;
  const DialogHeaderComponent = isMobile ? ShadSheetHeader : ShadDialogHeader;
  const DialogTitleComponent = isMobile ? ShadSheetTitle : ShadDialogTitle;
  const DialogDescriptionComponent = isMobile ? ShadSheetDescription : ShadDialogDescription;
  const DialogFooterComponent = isMobile ? ShadSheetFooter : ShadDialogFooter;
  const RootComponent = isMobile ? Sheet : Dialog;

  const title = parentAuthorName ? `Replying to ${parentAuthorName}` : "Add a Comment";
  const description = parentAuthorName ? `Your reply will appear under their comment.` : `Share your thoughts on the post: "${postTitle || 'this post'}"`;

  const commonContent = (
    <>
      <DialogHeaderComponent>
        <DialogTitleComponent className="flex items-center">
          <MessageSquareText className="mr-2 h-5 w-5 text-primary" /> {title}
        </DialogTitleComponent>
        <DialogDescriptionComponent>
          {description}
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

      <div className="py-4 space-y-4">
        <div>
          <Label htmlFor="comment-content" className="sr-only">Comment</Label>
          <Textarea
            id="comment-content"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What are your thoughts?"
            className="mt-1 min-h-[120px]"
            autoFocus
          />
        </div>
      </div>

      <DialogFooterComponent className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={content.trim().length < 1}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Post <Send className="ml-2 h-4 w-4"/>
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
