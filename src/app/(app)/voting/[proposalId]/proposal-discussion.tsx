"use client";

import React, { useState } from 'react';
import { format } from 'date-fns';
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  MessageSquare, Send, Loader2, Trash2, ChevronDown, ChevronUp,
} from "lucide-react";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  getProposalComments,
  createProposalComment,
  toggleProposalCommentReaction,
  deleteProposalComment,
} from '@/lib/actions/voting-actions';
import type { ProposalCommentData } from '@/lib/actions/voting-actions';

// ── Reaction Button ──

const REACTIONS = [
  { emoji: '👍', key: 'thumbsUp' as const, label: 'Agree' },
  { emoji: '😐', key: 'fist' as const, label: 'Neutral' },
  { emoji: '👎', key: 'thumbsDown' as const, label: 'Disagree' },
] as const;

function ReactionBar({
  commentId,
  reactions,
  userReaction,
  onUpdate,
}: {
  commentId: string;
  reactions: { thumbsUp: number; fist: number; thumbsDown: number };
  userReaction: string | null;
  onUpdate: (reactions: { thumbsUp: number; fist: number; thumbsDown: number }, userReaction: string | null) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  const handleReaction = async (emoji: string) => {
    setLoading(emoji);
    try {
      const result = await toggleProposalCommentReaction(commentId, emoji);
      const newUserReaction = result.toggled
        ? emoji  // If toggled on, user now has this reaction
        : null;  // If toggled off (same emoji clicked again)
      // But we need to handle the "swap" case — if user had 👍 and clicks 👎,
      // result.toggled is true and the reaction is 👎
      onUpdate(result.reactions, result.toggled ? emoji : null);
    } catch {
      // Silently fail — optimistic wasn't applied
    }
    setLoading(null);
  };

  return (
    <div className="flex items-center gap-1">
      {REACTIONS.map(({ emoji, key, label }) => {
        const count = reactions[key];
        const isActive = userReaction === emoji;
        return (
          <button
            key={emoji}
            onClick={() => handleReaction(emoji)}
            disabled={!!loading}
            title={label}
            className={cn(
              "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs transition-all",
              "hover:bg-accent/80 active:scale-95",
              isActive
                ? "bg-primary/10 ring-1 ring-primary/30 font-semibold"
                : "bg-muted/50",
              loading === emoji && "opacity-60"
            )}
          >
            <span className="text-sm">{emoji}</span>
            {count > 0 && (
              <span className={cn("text-[11px]", isActive ? "text-primary" : "text-muted-foreground")}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Single Comment Card ──

function ProposalComment({
  comment,
  level = 0,
  currentUserId,
  isAdmin,
  onRefresh,
}: {
  comment: ProposalCommentData;
  level?: number;
  currentUserId?: string | null;
  isAdmin?: boolean;
  onRefresh: () => void;
}) {
  const { toast } = useToast();
  const [reactions, setReactions] = useState(comment.reactions);
  const [userReaction, setUserReaction] = useState(comment.userReaction);
  const [showReplyForm, setShowReplyForm] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const isOwn = comment.authorId === currentUserId;
  const canDelete = isOwn || isAdmin;

  const handleReply = async () => {
    if (!replyContent.trim()) return;
    setSubmitting(true);
    try {
      await createProposalComment({
        proposalId: comment.proposalId,
        content: replyContent.trim(),
        parentCommentId: comment.id,
      });
      setReplyContent('');
      setShowReplyForm(false);
      onRefresh();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to post reply',
      });
    }
    setSubmitting(false);
  };

  const handleDelete = async () => {
    try {
      await deleteProposalComment(comment.id);
      toast({ title: 'Comment deleted' });
      onRefresh();
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to delete',
      });
    }
  };

  const indent = Math.min(level, 3);
  const indentClass = ['ml-0', 'ml-4', 'ml-7', 'ml-9'][indent];

  return (
    <div className={cn(indentClass)}>
      <div className="flex items-start gap-2 mt-3">
        <Avatar className={cn("shrink-0", level >= 2 ? "h-6 w-6" : "h-8 w-8")}>
          {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />}
          <AvatarFallback className="text-[10px] font-semibold">
            {comment.authorAvatarFallback}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <div className="bg-muted/50 rounded-lg p-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-semibold truncate">{comment.authorName}</span>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                  {format(comment.createdAt, "MMM d, h:mm a")}
                </span>
              </div>
              {canDelete && (
                <button
                  onClick={handleDelete}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors p-0.5"
                  title="Delete comment"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
            <p className="text-sm whitespace-pre-line mt-1">{comment.content}</p>
          </div>

          {/* Actions row */}
          <div className="flex items-center gap-3 mt-1 ml-1">
            <ReactionBar
              commentId={comment.id}
              reactions={reactions}
              userReaction={userReaction}
              onUpdate={(newReactions, newUserReaction) => {
                setReactions(newReactions);
                setUserReaction(newUserReaction);
              }}
            />
            {currentUserId && (
              <button
                onClick={() => setShowReplyForm(!showReplyForm)}
                className="text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                Reply
              </button>
            )}
          </div>

          {/* Inline reply form */}
          {showReplyForm && (
            <div className="mt-2 space-y-2">
              <Textarea
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                placeholder="Write a reply..."
                className="min-h-[60px] text-sm resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => { setShowReplyForm(false); setReplyContent(''); }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleReply}
                  disabled={submitting || !replyContent.trim()}
                >
                  {submitting ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Send className="mr-1 h-3 w-3" />}
                  Reply
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested replies */}
      {comment.replies.length > 0 && (
        <div className={cn(
          "border-l-2 pl-1 border-muted/50",
          level >= 3 ? "ml-0" : "ml-3"
        )}>
          {comment.replies.length > 2 && level >= 1 && (
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary ml-2 mt-1 transition-colors"
            >
              {collapsed ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              {collapsed ? `Show ${comment.replies.length} replies` : 'Collapse'}
            </button>
          )}
          {!collapsed && comment.replies.map(reply => (
            <ProposalComment
              key={reply.id}
              comment={reply}
              level={level + 1}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Discussion Thread ──

export function ProposalDiscussion({
  proposalId,
  currentUserId,
  isAdmin,
}: {
  proposalId: string;
  currentUserId?: string | null;
  isAdmin?: boolean;
}) {
  const { toast } = useToast();
  const [comments, setComments] = useState<ProposalCommentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadComments = React.useCallback(async () => {
    try {
      const data = await getProposalComments(proposalId);
      setComments(data);
    } catch {
      console.error('Failed to load comments');
    }
    setLoading(false);
  }, [proposalId]);

  React.useEffect(() => { loadComments(); }, [loadComments]);

  const handleSubmit = async () => {
    if (!newComment.trim()) return;
    setSubmitting(true);
    try {
      await createProposalComment({
        proposalId,
        content: newComment.trim(),
      });
      setNewComment('');
      loadComments(); // Refresh the full tree
    } catch (e: unknown) {
      toast({
        variant: 'destructive',
        title: 'Error',
        description: e instanceof Error ? e.message : 'Failed to post comment',
      });
    }
    setSubmitting(false);
  };

  const totalComments = React.useMemo(() => {
    function countAll(list: ProposalCommentData[]): number {
      return list.reduce((sum, c) => sum + 1 + countAll(c.replies), 0);
    }
    return countAll(comments);
  }, [comments]);

  return (
    <Card className="shadow-xl">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">
            Discussion
            {totalComments > 0 && (
              <span className="text-sm font-normal text-muted-foreground ml-2">
                ({totalComments} comment{totalComments !== 1 ? 's' : ''})
              </span>
            )}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* New comment form */}
        {currentUserId ? (
          <div className="space-y-2">
            <Textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Share your thoughts on this proposal..."
              className="min-h-[80px] text-sm resize-none"
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                React with 👍 😐 👎 to show agreement
              </p>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={submitting || !newComment.trim()}
              >
                {submitting ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                )}
                Comment
              </Button>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-center">
            <p className="text-sm text-muted-foreground">Sign in to join the discussion.</p>
          </div>
        )}

        {/* Comments list */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : comments.length === 0 ? (
          <div className="text-center py-6">
            <MessageSquare className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No comments yet. Be the first to share your perspective.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {comments.map(comment => (
              <ProposalComment
                key={comment.id}
                comment={comment}
                currentUserId={currentUserId}
                isAdmin={isAdmin}
                onRefresh={loadComments}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
