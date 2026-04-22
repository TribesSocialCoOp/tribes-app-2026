"use client";

import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { format } from 'date-fns';
import type { DiscussionComment } from '@/lib/types';

export const CommentInline: React.FC<{ comment: DiscussionComment; level?: number }> = ({ comment, level = 0 }) => (
  <div className={level > 0 ? 'ml-6 border-l-2 pl-3' : ''}>
    <div className="flex items-start gap-2">
      <Avatar className="h-6 w-6 mt-0.5">
        {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />}
        <AvatarFallback className="text-[10px]">{comment.authorAvatarFallback}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">{comment.authorName}</span>
          <span className="text-[10px] text-muted-foreground">{format(comment.timestamp, 'MMM d, h:mm a')}</span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-line">{comment.content}</p>
      </div>
    </div>
    {comment.replies && comment.replies.length > 0 && (
      <div className="mt-2 space-y-2">
        {comment.replies.map(reply => (
          <CommentInline key={reply.id} comment={reply} level={level + 1} />
        ))}
      </div>
    )}
  </div>
);
