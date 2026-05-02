"use client";

import React, { useState } from 'react';
import { format } from 'date-fns';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Smile, MoreVertical, Flag } from "lucide-react";
import { cn } from '@/lib/utils';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { toggleVibe } from '@/lib/actions/content-actions';
import type { DiscussionComment } from '@/lib/types';
import type { CommentContext } from './tribe-detail-context';

interface CommentCardProps {
  comment: DiscussionComment;
  postId: string;
  level?: number;
  onReportComment: (comment: DiscussionComment) => void;
  onOpenReplyDialog: (context: CommentContext) => void;
  isLoggedIn: boolean;
  isMember: boolean;
  currentUserId?: string | null;
}

export const CommentCard: React.FC<CommentCardProps> = ({
  comment, postId, level = 0,
  onReportComment, onOpenReplyDialog, isLoggedIn, isMember, currentUserId,
}) => {
  const isCurrentUserAuthor = comment.authorId === currentUserId;
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [vibeCount, setVibeCount] = useState(comment.vibes || 0);
  const emoticons = VIBE_EMOTICONS;

  const handleVibeSelection = async (vibe: string) => {
    const wasSelected = selectedVibe === vibe;
    const prevCount = vibeCount;
    // Optimistic update
    setSelectedVibe(wasSelected ? null : vibe);
    setVibeCount(wasSelected ? prevCount - 1 : prevCount + 1);
    try {
      const result = await toggleVibe(comment.id, 'comment', vibe);
      setSelectedVibe(result.vibed ? vibe : null);
      setVibeCount(result.newCount ?? vibeCount);
    } catch {
      // Revert on failure
      setSelectedVibe(wasSelected ? vibe : null);
      setVibeCount(prevCount);
    }
  };

  return (
    <div className={`ml-${level * 2} sm:ml-${level * 4}`}>
      <div className="flex items-start space-x-3 mt-3">
        <UserAvatar 
          user={{ name: comment.authorName, avatar: comment.authorAvatar }} 
          className="h-8 w-8" 
          fallback={comment.authorAvatarFallback}
          dataAiHint={comment.dataAiHintAvatar || "avatar"}
        />
        <div className="flex-1 bg-muted/50 rounded-lg p-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">{comment.authorName}</p>
            <div className="flex items-center space-x-2">
              <p className="text-xs text-muted-foreground">{format(comment.timestamp, "MMM d, h:mm a")}</p>
              {isLoggedIn && !isCurrentUserAuthor && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onReportComment(comment)}>
                      <Flag className="mr-2 h-4 w-4" /> Report
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>
          <p className="text-sm whitespace-pre-line mt-1">{comment.content}</p>
        </div>
      </div>
      <div className="ml-11 flex items-center space-x-2 text-xs">
        {isLoggedIn && isMember ? (
          <>
            <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "px-1 text-muted-foreground hover:text-primary h-6 text-xs",
                  selectedVibe && "bg-blue-100 border border-blue-300 text-blue-700 hover:bg-blue-200 rounded-full px-2"
                )}
              >
                {selectedVibe ? (
                  <span className="text-base mr-1">{selectedVibe}</span>
                ) : (
                  <Smile className="mr-1 h-3.5 w-3.5" />
                )}
                {vibeCount}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-2">
              <div className="flex space-x-1">
                {emoticons.map((emo) => (
                  <Button
                    key={emo}
                    variant="ghost"
                    size="icon"
                    className="text-xl p-1.5 h-auto w-auto rounded-md hover:bg-accent"
                    onClick={() => handleVibeSelection(emo)}
                  >
                    {emo}
                  </Button>
                ))}
              </div>
            </PopoverContent>
          </Popover>

            <Button variant="ghost" size="sm" onClick={() => onOpenReplyDialog({ postId, parentCommentId: comment.id, parentAuthorName: comment.authorName })} className="px-1 text-muted-foreground hover:text-primary h-6 text-xs">
              Reply
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="px-1 text-muted-foreground hover:text-primary h-6 text-xs"
            onClick={() => { if (!isLoggedIn) { /* Could redirect to login */ } }}
          >
            <Smile className="mr-1 h-3.5 w-3.5" />
            {vibeCount}
          </Button>
        )}
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="border-l-2 ml-5 pl-1 pb-2">
          {comment.replies.map(reply => (
            <CommentCard
              key={reply.id}
              comment={reply}
              postId={postId}
              level={level + 1}
              onReportComment={onReportComment}
              onOpenReplyDialog={onOpenReplyDialog}
              isLoggedIn={isLoggedIn}
              isMember={isMember}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
};
