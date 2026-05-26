"use client";

import React from 'react';
import { CommentCard } from '@/components/content/comment-card';
import type { DiscussionComment } from '@/lib/types';

interface PostCommentCardProps {
  comment: DiscussionComment;
  postId: string;
  level?: number;
  currentUserId?: string | null;
  postAuthorId?: string;
  onCommentAdded: () => void;
  tribeId?: string;
  isPublic?: boolean;
}

/**
 * Wrapper for the shared interactive CommentCard.
 * Standardizes comment behavior across feed and post-detail views.
 */
export const PostCommentCard: React.FC<PostCommentCardProps> = (props) => {
  return <CommentCard {...props} />;
};
