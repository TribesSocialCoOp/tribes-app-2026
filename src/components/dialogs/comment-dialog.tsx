
"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useCloseOnKeyboardHide } from '@/hooks/use-close-on-keyboard-hide';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { MessageSquareText, Send } from 'lucide-react';
import { MentionAutocomplete } from '../compose/mention-autocomplete';
import { useMentionAutocomplete } from '@/hooks/use-mention-autocomplete';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";

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
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { mentionQuery, mentionRef, checkMention, handleSelectMention, handleMentionKeyDown, resetMention } =
    useMentionAutocomplete(textareaRef, content, setContent);

  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);
  useCloseOnKeyboardHide(isOpen, handleClose);

  useEffect(() => {
    if (!isOpen) {
      setContent("");
      resetMention();
    }
  }, [isOpen, resetMention]);

  const handleConfirm = () => {
    onConfirmComment(content);
    onOpenChange(false);
  };

  const title = parentAuthorName ? `Replying to ${parentAuthorName}` : "Add a Comment";
  const description = parentAuthorName ? `Your reply will appear under their comment.` : `Share your thoughts on the post: "${postTitle || 'this post'}"`;

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center">
          <MessageSquareText className="mr-2 h-5 w-5 text-primary" /> {title}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          {description}
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="py-4 space-y-4">
        <div>
          <Label htmlFor="comment-content" className="sr-only">Comment</Label>
          <div className="relative">
            <Textarea
              id="comment-content"
              ref={textareaRef}
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                checkMention(e.target.value, e.target.selectionStart);
              }}
              onKeyDown={handleMentionKeyDown}
              onSelect={(e) => {
                const target = e.target as HTMLTextAreaElement;
                checkMention(target.value, target.selectionStart);
              }}
              placeholder="What are your thoughts?"
              className="mt-1 min-h-[120px] w-full"
              autoFocus
            />
            <MentionAutocomplete
              ref={mentionRef}
              query={mentionQuery}
              onSelect={handleSelectMention}
            />
          </div>
        </div>
      </div>

      <ResponsiveDialogFooter className="pt-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button
          onClick={handleConfirm}
          disabled={content.trim().length < 1}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          Post <Send className="ml-2 h-4 w-4"/>
        </Button>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
