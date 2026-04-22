
"use client";

import React from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { TribePost } from '@/lib/types';
import { Flag } from 'lucide-react';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

interface ReportPostDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  post: TribePost | null;
  reportReason: string;
  setReportReason: (reason: string) => void;
  onConfirmReport: () => void;
}

export function ReportPostDialog({
  isOpen,
  onOpenChange,
  post,
  reportReason,
  setReportReason,
  onConfirmReport
}: ReportPostDialogProps) {
  if (!post) return null;

  const handleConfirm = () => {
    onConfirmReport();
    onOpenChange(false);
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center">
          <Flag className="mr-2 h-5 w-5 text-destructive" /> Report Post
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Please provide a reason for reporting the post: <span className="italic font-semibold">"{post.title || 'this post'}"</span>.
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
          <Label htmlFor="report-reason" className="text-sm font-medium text-foreground">Reason for Report</Label>
          <Textarea
            id="report-reason"
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            placeholder="Explain why you are reporting this post (e.g., spam, harassment, misinformation)..."
            className="mt-1 min-h-[100px]"
          />
        </div>
      </div>

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          variant="destructive"
          disabled={reportReason.trim().length < 5}
        >
          Submit Report
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}