
"use client";

import React from 'react';
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
import type { DiscussionComment } from '@/app/(app)/our-story/[storyId]/page'; // Updated import path
import { Flag } from 'lucide-react';

interface ReportCommentDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  comment: DiscussionComment | null; // Changed from TribePost
  reportReason: string;
  setReportReason: (reason: string) => void;
  onConfirmReport: () => void;
}

export function ReportCommentDialog({
  isOpen,
  onOpenChange,
  comment, // Changed prop name and type
  reportReason,
  setReportReason,
  onConfirmReport
}: ReportCommentDialogProps) {
  const isMobile = useIsMobile();

  if (!comment) { // Check for comment object
    return null;
  }

  const handleConfirm = () => {
    onConfirmReport();
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
          <Flag className="mr-2 h-5 w-5 text-destructive" /> Report Comment
        </DialogTitleComponent>
        <DialogDescriptionComponent>
          Please provide a reason for reporting the comment by <span className="italic font-semibold">"{comment.authorName}"</span>.
        </DialogDescriptionComponent>
      </DialogHeaderComponent>

      <div className="py-4 space-y-4">
        <div>
          <p className="text-sm font-medium text-foreground mb-1">Comment Preview:</p>
          <div className="p-3 border rounded-md bg-muted/50 max-h-24 overflow-y-auto text-xs text-muted-foreground">
            <p className="line-clamp-3">{comment.content}</p>
          </div>
        </div>

        <div>
          <Label htmlFor="report-reason-comment" className="text-sm font-medium text-foreground">Reason for Report</Label>
          <Textarea
            id="report-reason-comment"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Explain why you are reporting this comment (e.g., spam, harassment, misinformation)..."
            className="mt-1 min-h-[100px]"
          />
        </div>
      </div>

      <DialogFooterComponent className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="destructive"
          disabled={reportReason.trim().length < 5} 
        >
          Submit Report
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
