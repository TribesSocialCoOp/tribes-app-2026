"use client";

import React, { useState, useEffect } from 'react';
import { useOptimisticVibes } from '@/hooks/use-optimistic-vibes';
import { useUser } from '@/hooks/use-user';
import { format } from 'date-fns';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";

import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
  ResponsiveMenuSeparator,
} from "@/components/ui/responsive-menu";

import { Smile, MoreVertical, Flag, UserRoundX, Lock, Pencil, Check, X, Loader2, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";
/**
 * @fileoverview Tribes-specific Comment Card.
 * 
 * NOTE: This component is intentionally kept separate from the global CommentCard
 * (in src/components/content/comment-card.tsx) to support distinct styling
 * (e.g., bg-muted/50 bubble backgrounds) and a dialog-based reply UX instead of
 * desktop inline inputs.
 */

import { cn, countAllComments } from '@/lib/utils';

import { editComment, deleteOwnComment } from '@/lib/actions/content-actions';
import { useToast } from '@/hooks/use-toast';
import type { DiscussionComment } from '@/lib/types';
import type { CommentContext } from './tribe-detail-context';
import Link from 'next/link';
import { profilePath } from '@/lib/utils/paths';
import { VibePicker } from '@/components/ui/vibe-picker';
import { MarkdownContent } from '@/components/ui/markdown-content';


interface CommentCardProps {
  comment: DiscussionComment;
  postId: string;
  level?: number;
  onReportComment: (comment: DiscussionComment) => void;
  onOpenReplyDialog: (context: CommentContext) => void;
  isLoggedIn: boolean;
  isMember: boolean;
  currentUserId?: string | null;
  postAuthorId?: string;
  tribeId?: string;
  onCommentAdded?: () => void;
  isPublic?: boolean;
}

export const CommentCard: React.FC<CommentCardProps> = ({
  comment, postId, level = 0,
  onReportComment, onOpenReplyDialog, isLoggedIn, isMember, currentUserId, postAuthorId, tribeId,
  onCommentAdded, isPublic = true,
}) => {
  const { toast } = useToast();
  const { user } = useUser();
  const isCurrentUserAuthor = comment.authorId === currentUserId;
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);

  const isPostAuthor = !!(currentUserId && postAuthorId && currentUserId === postAuthorId);
  // Comment author or post author can see who reacted (tooltip/drawer)
  const canSeeReactors = isCurrentUserAuthor || isPostAuthor;

  // ── Vibes (consolidated hook) ──
  const userVibe = comment.vibeDetails?.find(v => v.userId === currentUserId)?.emoji ?? null;
  const {
    vibeCount,
    recentVibes: localRecentVibes,
    vibeDetails: currentVibeDetails,
    selectedVibe,
    handleVibeSelection,
  } = useOptimisticVibes({
    targetId: comment.id,
    targetType: 'comment',
    serverVibeCount: comment.vibes || 0,
    serverRecentVibes: comment.recentVibes || [],
    serverVibeDetails: comment.vibeDetails || [],
    serverHasVibed: false,
    serverSelectedVibe: userVibe,
    canSeeReactors: canSeeReactors,
    currentUserId,
    currentUserName: user?.name,
  });

  // ── Edit state ──
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // ── Collapsible thread state ──
  const [isCollapsed, setIsCollapsed] = useState(false);

  // ── Comment decryption ──
  const [displayContent, setDisplayContent] = useState(comment.content);
  const [decryptionStatus, setDecryptionStatus] = useState<'decrypting' | 'success' | 'missing_key' | 'failed' | 'idle'>(comment.isEncrypted ? 'decrypting' : 'idle');

  useEffect(() => {
    if (!comment.isEncrypted || !comment.ciphertextBase64 || !comment.encryptionIv) return;
    let active = true;

    async function decryptComment() {
      try {
        if (!tribeId) { if (active) setDecryptionStatus('missing_key'); return; }
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = await getTribeKey(tribeId);
        if (!cachedTribeKey) { if (active) setDecryptionStatus('missing_key'); return; }
        const { decryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
        const { fromBase64 } = await import('@/lib/crypto/encoding');
        const ciphertextBuffer = fromBase64(comment.ciphertextBase64!);
        const plaintext = await decryptWithTribeKey(ciphertextBuffer, comment.encryptionIv!, cachedTribeKey.key);
        if (active) { setDisplayContent(plaintext); setDecryptionStatus('success'); }
      } catch (err) {
        console.error('[TribeCommentCard] Decryption failed:', err);
        if (active) setDecryptionStatus('failed');
      }
    }

    decryptComment();
    return () => { active = false; };
  }, [comment.id, comment.isEncrypted, comment.ciphertextBase64, comment.encryptionIv, tribeId]);

  // ── Opportunistic backfill: encrypt legacy plaintext comments ──
  useEffect(() => {
    if (comment.isEncrypted || isPublic || !tribeId || !comment.content || comment.content === '[encrypted]') return;

    let active = true;
    async function backfill() {
      try {
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = await getTribeKey(tribeId!);
        if (!cachedTribeKey) return;

        const { encryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
        const { toBase64 } = await import('@/lib/crypto/encoding');
        const encrypted = await encryptWithTribeKey(comment.content, cachedTribeKey.key);

        if (!active) return;

        const { backfillEncryptComment } = await import('@/lib/actions/content-actions');
        await backfillEncryptComment(comment.id, toBase64(encrypted.ciphertext), encrypted.iv);
        console.log(`[TribeCommentCard] Backfilled encryption for comment ${comment.id}`);
      } catch (err) {
        console.warn('[TribeCommentCard] Backfill failed:', err);
      }
    }

    backfill();
    return () => { active = false; };
  }, [comment.id, comment.isEncrypted, comment.content, isPublic, tribeId]);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  const handleDeleteComment = async () => {
    setIsDeletingComment(true);
    try {
      await deleteOwnComment(comment.id);
      toast({
        title: "Comment deleted",
        description: "Your comment has been deleted successfully.",
      });
      setIsDeleteDialogOpen(false);
      if (onCommentAdded) {
        onCommentAdded();
      }
    } catch (err: any) {
      toast({
        title: "Error deleting comment",
        description: err.message || "An unexpected error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsDeletingComment(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editContent.trim()) return;
    setIsSavingEdit(true);
    try {
      await editComment(comment.id, editContent.trim());
      setDisplayContent(editContent.trim());
      setIsEditing(false);
      toast({ title: 'Comment updated' });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to save';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Progressive indentation: cap at ml-6 on mobile to preserve content width
  const INDENT_CLASSES = ["ml-0", "ml-3", "ml-5", "ml-6", "ml-6"] as const;
  const indentClass = INDENT_CLASSES[Math.min(level, INDENT_CLASSES.length - 1)];
  const isDeep = level >= 2; // Hide avatars on mobile at depth 2+
  const isFlat = level >= 4; // Stop nesting on mobile at depth 4+

  if (isCollapsed) {
    return (
      <div className={cn(isFlat ? "ml-0 md:ml-6" : indentClass, "mt-3")} id={`comment-${comment.id}`}>
        <button 
          className="flex items-center gap-1.5 bg-muted/20 hover:bg-muted/30 border border-transparent rounded-lg px-3 py-1.5 cursor-pointer text-xs text-muted-foreground w-fit transition-all" 
          onClick={() => setIsCollapsed(false)}
        >
          <ChevronRight className="h-3.5 w-3.5 text-primary/80 shrink-0" />
          <span className="font-medium text-foreground">{comment.authorName}</span>
          <span>·</span>
          <span>{countAllComments(comment.replies ?? [])} replies hidden</span>
        </button>
      </div>
    );
  }

  return (
    <div className={cn(isFlat ? "ml-0 md:ml-6" : indentClass)} id={`comment-${comment.id}`}>
      <div className={cn("flex items-start mt-3", isDeep ? "space-x-1 md:space-x-3" : "space-x-2 md:space-x-3")}>
        {/* Hide full avatar on mobile at depth 2+; show compact version on desktop only */}
        {isDeep ? (
          <>
            <div className="hidden md:block shrink-0">
              {!comment.authorIsAlias ? (
                <Link href={profilePath(comment.authorId, comment.authorSlug)}>
                  <UserAvatar 
                    user={{ name: comment.authorName, avatar: comment.authorAvatar }} 
                    className="h-6 w-6 shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" 
                    fallback={comment.authorAvatarFallback}
                    dataAiHint={comment.dataAiHintAvatar || "avatar"}
                  />
                </Link>
              ) : (
                <UserAvatar 
                  user={{ name: comment.authorName, avatar: comment.authorAvatar }} 
                  className="h-6 w-6 shrink-0" 
                  fallback={comment.authorAvatarFallback}
                  dataAiHint={comment.dataAiHintAvatar || "avatar"}
                />
              )}
            </div>
          </>
        ) : (
          !comment.authorIsAlias ? (
            <Link href={profilePath(comment.authorId, comment.authorSlug)}>
              <UserAvatar 
                user={{ name: comment.authorName, avatar: comment.authorAvatar }} 
                className="h-8 w-8 shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" 
                fallback={comment.authorAvatarFallback}
                dataAiHint={comment.dataAiHintAvatar || "avatar"}
              />
            </Link>
          ) : (
            <UserAvatar 
              user={{ name: comment.authorName, avatar: comment.authorAvatar }} 
              className="h-8 w-8 shrink-0" 
              fallback={comment.authorAvatarFallback}
              dataAiHint={comment.dataAiHintAvatar || "avatar"}
            />
          )
        )}
        <div id={`comment-bubble-${comment.id}`} className="flex-1 bg-muted/50 rounded-lg p-2.5 transition-all duration-500">
          <div className={cn("flex justify-between", isDeep ? "flex-col gap-0.5 md:flex-row md:items-center" : "items-center")}>
            <div className="flex items-center gap-1.5 min-w-0">
              {!comment.authorIsAlias ? (
                <Link href={profilePath(comment.authorId, comment.authorSlug)} className="hover:underline decoration-primary/30 underline-offset-2">
                  <p className="text-xs font-semibold truncate">{comment.authorName}</p>
                </Link>
              ) : (
                <p className="text-xs font-semibold truncate">{comment.authorName}</p>
              )}
              {/* Date inline on desktop / non-deep, separate line when deep+mobile */}
              {!isDeep && (
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">{format(comment.timestamp, "MMM d, h:mm a")}</p>
              )}
              {comment.replies && comment.replies.length > 0 && (
                <button 
                  onClick={() => setIsCollapsed(true)} 
                  className="text-muted-foreground/60 hover:text-primary transition-colors cursor-pointer select-none rounded hover:bg-muted/50 p-0.5 flex items-center justify-center"
                  title="Collapse thread"
                >
                  <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                </button>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {isDeep && (
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">{format(comment.timestamp, "MMM d, h:mm a")}</p>
              )}
              {isLoggedIn && (
                <ResponsiveMenu>
                  <ResponsiveMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 touch-target-44 text-muted-foreground">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </ResponsiveMenuTrigger>
                  <ResponsiveMenuContent align="end">
                    {isCurrentUserAuthor && (
                      <>
                        <ResponsiveMenuItem onClick={() => {
                          setEditContent(displayContent);
                          setIsEditing(true);
                        }}>
                          <Pencil className="mr-2 h-4 w-4" /> Edit
                        </ResponsiveMenuItem>
                        <ResponsiveMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setIsDeleteDialogOpen(true)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" /> Delete
                        </ResponsiveMenuItem>
                        <ResponsiveMenuSeparator />
                      </>
                    )}
                    {!isCurrentUserAuthor && (
                      <>
                        <ResponsiveMenuItem onClick={() => onReportComment(comment)}>
                          <Flag className="mr-2 h-4 w-4" /> Report
                        </ResponsiveMenuItem>
                        <ResponsiveMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setIsBlockDialogOpen(true)}
                        >
                          <UserRoundX className="mr-2 h-4 w-4" /> Block User
                        </ResponsiveMenuItem>
                      </>
                    )}
                  </ResponsiveMenuContent>
                </ResponsiveMenu>
              )}
            </div>
          </div>
          {comment.isEncrypted && decryptionStatus === 'decrypting' && (
            <div className="space-y-1.5 animate-pulse mt-1">
              <div className="h-3 bg-muted/60 rounded w-full"></div>
              <div className="h-3 bg-muted/60 rounded w-4/6"></div>
            </div>
          )}
          {comment.isEncrypted && decryptionStatus === 'missing_key' && (
            <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span className="text-xs">Waiting for encryption keys</span>
            </div>
          )}
          {comment.isEncrypted && decryptionStatus === 'failed' && (
            <div className="flex items-center gap-1.5 mt-1 text-destructive">
              <Lock className="h-3 w-3" />
              <span className="text-xs">Decryption failed</span>
            </div>
          )}
          {/* Content (edit mode is now a dialog) */}
          {(!comment.isEncrypted || decryptionStatus === 'success') && (
            <MarkdownContent content={displayContent} className="mt-1 [&_p]:mb-0 text-sm" />
          )}
        </div>
      </div>
      <div className={cn("flex items-center space-x-2 text-xs", isDeep ? "ml-1 md:ml-9" : "ml-11")}>
        {isLoggedIn && isMember ? (
          <>
            <VibePicker
              vibeCount={vibeCount}
              recentVibes={localRecentVibes}
              vibeDetails={currentVibeDetails}
              hasVibed={!!selectedVibe}
              isAuthor={canSeeReactors}
              onVibeSelect={handleVibeSelection}
            />

            <Button variant="ghost" size="sm" onClick={() => onOpenReplyDialog({ postId, parentCommentId: comment.id, parentAuthorName: comment.authorName })} className="px-1 text-muted-foreground hover:text-primary h-6 text-xs">
              Reply
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="px-1 text-muted-foreground hover:text-primary h-6 text-xs pointer-events-none"
          >
            {localRecentVibes.length > 0 ? (
              <div className="flex -space-x-1.5 mr-1">
                {localRecentVibes.map((rv, i) => (
                  <span
                    key={i}
                    className="text-base z-10 bg-background rounded-full leading-none p-[1px] shadow-sm relative"
                  >
                    {rv.emoji}
                  </span>
                ))}
              </div>
            ) : (
              <Smile className="mr-1 h-3.5 w-3.5" />
            )}
            {vibeCount}
          </Button>
        )}
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className={cn(
          // Mobile at depth 4+: flat stack with thin vertical line, no indent
          isFlat
            ? "border-l md:border-l-2 pl-2 md:pl-1 ml-0 md:ml-3 border-muted-foreground/20 md:border-muted/50"
            : "border-l-2 pl-1 pb-2 border-muted/50",
          !isFlat && (level >= 3 ? "ml-1 md:ml-3" : "ml-3")
        )}>
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
              postAuthorId={postAuthorId}
              tribeId={tribeId}
              onCommentAdded={onCommentAdded}
              isPublic={isPublic}
            />
          ))}
        </div>
      )}

      <ConfirmActionDialog
        open={isBlockDialogOpen}
        onOpenChange={setIsBlockDialogOpen}
        title={`Block ${comment.authorName}?`}
        description="Are you sure you want to block this user? You will no longer see their posts or messages."
        confirmText="Block"
        destructive={true}
        onConfirm={async () => {
          try {
            const { blockUser } = await import('@/lib/actions/bond-actions');
            await blockUser(comment.authorId, 'Blocked from comment context menu');
            window.location.reload();
          } catch (err) {
            console.error('Block failed:', err);
          }
        }}
      />

      {/* ── Comment deletion dialog ── */}
      <ConfirmActionDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Comment?"
        description="This will permanently delete this comment and all its replies. This action cannot be undone."
        confirmText={isDeletingComment ? "Deleting..." : "Delete"}
        destructive={true}
        onConfirm={handleDeleteComment}
      />

      {/* ── Edit comment dialog ── */}
      <ResponsiveDialog open={isEditing} onOpenChange={setIsEditing}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center">
            <Pencil className="mr-2 h-5 w-5 text-primary" /> Edit Comment
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Update your comment below.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <div className="py-4">
          <Label htmlFor={`edit-comment-${comment.id}`} className="sr-only">Comment</Label>
          <Textarea
            id={`edit-comment-${comment.id}`}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="min-h-[120px] w-full resize-none"
          />
        </div>
        <ResponsiveDialogFooter className="pt-2">
          <Button variant="outline" onClick={() => setIsEditing(false)} disabled={isSavingEdit}>
            Cancel
          </Button>
          <Button onClick={handleSaveEdit} disabled={isSavingEdit || !editContent.trim()}>
            {isSavingEdit ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
            Save
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>
    </div>
  );
};
