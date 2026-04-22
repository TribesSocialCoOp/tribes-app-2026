
"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { TribePost } from '@/lib/types';
import { RefreshCcw } from 'lucide-react';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

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
  const [editedContent, setEditedContent] = useState("");

  useEffect(() => {
    if (isOpen && postToRepost) {
      setEditedContent(postToRepost.content);
    } else if (!isOpen) {
      setEditedContent("");
    }
  }, [isOpen, postToRepost]);

  if (!postToRepost) return null;

  const handleConfirm = () => {
    onConfirmRepost(editedContent, postToRepost.title);
  };

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center">
          <RefreshCcw className="mr-2 h-5 w-5 text-primary" /> Repost Content
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Review and edit the content before reposting. Original title: "<span className="italic font-semibold">{postToRepost.title || "Untitled Post"}</span>".
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

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

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
          disabled={editedContent.trim().length < 5}
        >
          Confirm Repost
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
