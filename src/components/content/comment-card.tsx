"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useOptimisticVibes } from '@/hooks/use-optimistic-vibes';
import { useUser } from '@/hooks/use-user';
import { format } from 'date-fns';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  ResponsiveDialog,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
} from "@/components/ui/responsive-dialog";

import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";

import { Smile, MoreVertical, Flag, UserRoundX, Pencil, Check, X, Send, Loader2, Lock, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { CommentDialog } from '@/components/dialogs/comment-dialog';
/**
 * @fileoverview Shared interactive comment card.
 * 
 * NOTE: This component is intentionally kept separate from the Tribes-specific CommentCard
 * (in src/app/(app)/tribes/[tribeId]/comment-card.tsx) to support distinct styling
 * (e.g., bg-muted/30 bubble backgrounds and border styling) and the inline reply UX
 * with autocomplete on desktop.
 * 
 * Supports: vibes, reply-to-comment, edit own comment, report, block.
 */

import { cn, countAllComments } from '@/lib/utils';
import { useIsMobile } from "@/hooks/use-mobile";
import { createComment, editComment, reportComment, deleteOwnComment } from '@/lib/actions/content-actions';
import { useToast } from '@/hooks/use-toast';
import type { DiscussionComment } from '@/lib/types';
import Link from 'next/link';
import { MentionAutocomplete } from '../compose/mention-autocomplete';
import { useMentionAutocomplete } from '@/hooks/use-mention-autocomplete';
import { EmojiAutocomplete } from '../compose/emoji-autocomplete';
import { useEmojiAutocomplete } from '@/hooks/use-emoji-autocomplete';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { profilePath } from '@/lib/utils/paths';
import { VibePicker } from '@/components/ui/vibe-picker';


interface CommentCardProps {
  comment: DiscussionComment;
  postId: string;
  level?: number;
  currentUserId?: string | null;
  postAuthorId?: string;
  onCommentAdded: (newReply?: DiscussionComment) => void; // callback to reload comments after reply
  tribeId?: string; // needed for comment decryption + encryption of replies
  isPublic?: boolean; // tribe public flag — false means comments should be encrypted
}

/**
 * Shared interactive comment card.
 * Supports: vibes, reply-to-comment, edit own comment, report, block.
 */
export const CommentCard: React.FC<CommentCardProps> = ({
  comment, postId, level = 0, currentUserId, postAuthorId, onCommentAdded, tribeId, isPublic = true,
}) => {
  const { toast } = useToast();
  const { user } = useUser();
  const isOwnComment = comment.authorId === currentUserId;
  const isMobile = useIsMobile();

  const isPostAuthor = !!(currentUserId && postAuthorId && currentUserId === postAuthorId);
  // Comment author or post author can see who reacted (tooltip/drawer)
  const canSeeReactors = isOwnComment || isPostAuthor;

  // ── Vibes (consolidated hook) ──
  const userVibe = comment.selectedVibe ?? comment.vibeDetails?.find(v => v.userId === currentUserId)?.emoji ?? null;
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
    serverHasVibed: !!userVibe,
    serverSelectedVibe: userVibe,
    canSeeReactors,
    currentUserId,
    currentUserName: user?.name,
  });

  // ── Edit ──
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [displayContent, setDisplayContent] = useState(comment.content);
  const [decryptionStatus, setDecryptionStatus] = useState<'decrypting' | 'success' | 'missing_key' | 'failed' | 'idle'>(comment.isEncrypted ? 'decrypting' : 'idle');

  // ── Decrypt encrypted comment ──
  useEffect(() => {
    if (!comment.isEncrypted || !comment.ciphertextBase64 || !comment.encryptionIv) return;
    let active = true;

    async function decryptComment() {
      try {
        if (!tribeId) { if (active) setDecryptionStatus('missing_key'); return; }

        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = user?.id ? await getTribeKey(user.id, tribeId) : null;
        if (!cachedTribeKey) { if (active) setDecryptionStatus('missing_key'); return; }

        const { decryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
        const { fromBase64 } = await import('@/lib/crypto/encoding');
        const ciphertextBuffer = fromBase64(comment.ciphertextBase64!);
        const plaintext = await decryptWithTribeKey(
          ciphertextBuffer,
          comment.encryptionIv!,
          cachedTribeKey.key,
        );
        if (active) {
          setDisplayContent(plaintext);
          setDecryptionStatus('success');
        }
      } catch (err) {
        console.error('[CommentCard] Decryption failed:', err);
        if (active) setDecryptionStatus('failed');
      }
    }

    decryptComment();
    return () => { active = false; };
  }, [comment.id, comment.isEncrypted, comment.ciphertextBase64, comment.encryptionIv, tribeId, user?.id]);

  // ── Opportunistic backfill: encrypt legacy plaintext comments ──
  useEffect(() => {
    // Only backfill if: comment is NOT encrypted, tribe is private, and we have plaintext content
    if (comment.isEncrypted || isPublic || !tribeId || !comment.content || comment.content === '[encrypted]') return;

    let active = true;
    async function backfill() {
      try {
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = user?.id ? await getTribeKey(user.id, tribeId!) : null;
        if (!cachedTribeKey) return; // No key available — can't backfill

        const { encryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
        const { toBase64 } = await import('@/lib/crypto/encoding');
        const encrypted = await encryptWithTribeKey(comment.content, cachedTribeKey.key);

        if (!active) return;

        const { backfillEncryptComment } = await import('@/lib/actions/content-actions');
        await backfillEncryptComment(
          comment.id,
          toBase64(encrypted.ciphertext),
          encrypted.iv,
        );
        console.log(`[CommentCard] Backfilled encryption for comment ${comment.id}`);
      } catch (err) {
        // Silent — backfill is best-effort
        console.warn('[CommentCard] Backfill failed:', err);
      }
    }

    backfill();
    return () => { active = false; };
  }, [comment.id, comment.isEncrypted, comment.content, isPublic, tribeId, user?.id]);

  // ── Reply ──
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [isReplyDialogOpen, setIsReplyDialogOpen] = useState(false);

  // ── Collapsible thread state ──
  const [isCollapsed, setIsCollapsed] = useState(false);

  // ── Block ──
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);

  // ── Deletion ──
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeletingComment, setIsDeletingComment] = useState(false);

  // ── Mentions Autocomplete ──
  const replyTextareaRef = useRef<HTMLTextAreaElement>(null);

  const { mentionQuery, mentionRef, checkMention, handleSelectMention, handleMentionKeyDown } =
    useMentionAutocomplete(replyTextareaRef, replyText, setReplyText);

  const { emojiQuery, emojiRef, checkEmoji, handleSelectEmoji, handleEmojiKeyDown } =
    useEmojiAutocomplete(replyTextareaRef, replyText, setReplyText);

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

  /** Scroll a newly created reply into view and briefly highlight it */
  const scrollToAndHighlight = useCallback((commentId: string) => {
    // Wait for the DOM to update after onCommentAdded() refreshes comments
    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(`comment-bubble-${commentId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-primary/60');
          setTimeout(() => el.classList.remove('ring-2', 'ring-primary/60'), 2000);
        }
      }, 300); // small delay for comment list to re-render
    });
  }, []);

  const sendReply = useCallback(async (content: string) => {
    // Encrypt reply for private tribes
    let encPayload: { ciphertextBase64: string; iv: string } | undefined;
    if (!isPublic && tribeId) {
      const { getTribeKey } = await import('@/lib/crypto/key-store');
      const cachedTribeKey = user?.id ? await getTribeKey(user.id, tribeId) : null;
      if (!cachedTribeKey) {
        throw new Error('Encryption keys have not synced yet. Please wait a moment and try again.');
      }
      const { encryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
      const { toBase64 } = await import('@/lib/crypto/encoding');
      const encrypted = await encryptWithTribeKey(content.trim(), cachedTribeKey.key);
      encPayload = {
        ciphertextBase64: toBase64(encrypted.ciphertext),
        iv: encrypted.iv,
      };
    }

    const result = await createComment(postId, content.trim(), comment.id, encPayload);
    if (result && typeof result === 'object' && 'serverError' in result) {
      throw new Error(result.serverError as string);
    }
    return result;
  }, [isPublic, tribeId, postId, comment.id]);

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    try {
      const result = await sendReply(replyText);
      toast({ title: 'Reply sent' });
      setReplyText('');
      setShowReply(false);
      onCommentAdded(result as DiscussionComment);
      if (result && typeof result === 'object' && 'id' in result) {
        scrollToAndHighlight(result.id as string);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send reply';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSendingReply(false);
    }
  };

  /** Handle reply from the mobile CommentDialog modal */
  const handleDialogReply = async (content: string) => {
    try {
      const result = await sendReply(content);
      toast({ title: 'Reply sent' });
      setIsReplyDialogOpen(false);
      onCommentAdded(result as DiscussionComment);
      if (result && typeof result === 'object' && 'id' in result) {
        scrollToAndHighlight(result.id as string);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send reply';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const handleReport = async () => {
    try {
      await reportComment({
        commentId: comment.id,
        commentAuthor: comment.authorName,
        reason: 'Reported from app',
      });
      toast({ title: 'Comment reported', description: 'An admin will review it.' });
    } catch {
      toast({ title: 'Error', description: 'Failed to report.', variant: 'destructive' });
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
        {/* Hide full avatar on mobile at depth 2+; show compact initial instead */}
        {isDeep ? (
          <>
            {/* Desktop: still show avatar */}
            <div className="hidden md:block shrink-0">
              {!comment.authorIsAlias ? (
                <Link href={profilePath(comment.authorId, comment.authorSlug)}>
                  <UserAvatar
                    user={{ name: comment.authorName, avatar: comment.authorAvatar }}
                    className="h-6 w-6 shrink-0 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
                    fallback={comment.authorAvatarFallback}
                  />
                </Link>
              ) : (
                <UserAvatar
                  user={{ name: comment.authorName, avatar: comment.authorAvatar }}
                  className="h-6 w-6 shrink-0"
                  fallback={comment.authorAvatarFallback}
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
              />
            </Link>
          ) : (
            <UserAvatar
              user={{ name: comment.authorName, avatar: comment.authorAvatar }}
              className="h-8 w-8 shrink-0"
              fallback={comment.authorAvatarFallback}
            />
          )
        )}
        <div id={`comment-bubble-${comment.id}`} className="flex-1 bg-muted/30 rounded-lg p-2.5 transition-all duration-500 border border-transparent hover:border-border/50">
          <div className={cn("flex justify-between", isDeep ? "flex-col gap-0.5 md:flex-row md:items-center" : "items-center")}>
            <div className="flex items-center gap-1.5 min-w-0">
              {!comment.authorIsAlias ? (
                <Link href={profilePath(comment.authorId, comment.authorSlug)} className="hover:underline decoration-primary/30 underline-offset-2">
                  <p className="text-xs font-semibold truncate max-w-[150px]">{comment.authorName}</p>
                </Link>
              ) : (
                <p className="text-xs font-semibold truncate max-w-[150px]">{comment.authorName}</p>
              )}
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
              {currentUserId && (
                <ResponsiveMenu>
                  <ResponsiveMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 touch-target-44 text-muted-foreground">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </ResponsiveMenuTrigger>
                  <ResponsiveMenuContent align="end">
                    {isOwnComment && (
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
                    {!isOwnComment && (
                      <>
                        <ResponsiveMenuItem onClick={handleReport}>
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

          {/* Content (edit mode is now a dialog) */}
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
          {(!comment.isEncrypted || decryptionStatus === 'success') && (
            <MarkdownContent content={displayContent} className="mt-1 [&_p]:mb-0 text-sm" />
          )}
        </div>
      </div>

      {/* ── Action buttons: vibe + reply ── */}
      <div className={cn("flex items-center space-x-2 text-xs mt-1", isDeep ? "ml-1 md:ml-9" : "ml-11")}>
        {currentUserId ? (
          <>
            <VibePicker
              vibeCount={vibeCount}
              recentVibes={localRecentVibes}
              vibeDetails={currentVibeDetails}
              hasVibed={!!selectedVibe}
              isAuthor={canSeeReactors}
              onVibeSelect={handleVibeSelection}
            />

            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (isMobile) {
                  setIsReplyDialogOpen(true);
                } else {
                  setShowReply(!showReply);
                  setIsReplyDialogOpen(false);
                }
              }}
              className="px-1 text-muted-foreground hover:text-primary h-6 text-xs"
            >
              Reply
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="px-1 text-muted-foreground h-6 text-xs pointer-events-none">
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

      {/* ── Inline reply to this comment (desktop only) ── */}
      {showReply && !isMobile && (
        <div className={cn("mt-2 flex gap-2", isDeep ? "ml-1 md:ml-9" : "ml-11")}>
          <div className="relative flex-1 z-10">
            <Textarea
              ref={replyTextareaRef}
              placeholder={`Reply to ${comment.authorName}...`}
              value={replyText}
              onChange={(e) => {
                setReplyText(e.target.value);
                checkMention(e.target.value, e.target.selectionStart);
                checkEmoji(e.target.value, e.target.selectionStart);
              }}
              onKeyDown={(e) => {
                handleMentionKeyDown(e);
                handleEmojiKeyDown(e);
                if (e.isDefaultPrevented()) return;

                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleSendReply();
                }
              }}
              onSelect={(e) => {
                const target = e.target as HTMLTextAreaElement;
                checkMention(target.value, target.selectionStart);
                checkEmoji(target.value, target.selectionStart);
              }}
              className="text-sm min-h-[36px] resize-none w-full"
              rows={2}
              autoFocus
            />
            <MentionAutocomplete
              ref={mentionRef}
              query={mentionQuery}
              onSelect={handleSelectMention}
            />
            <EmojiAutocomplete
              ref={emojiRef}
              query={emojiQuery}
              onSelect={handleSelectEmoji}
            />
          </div>
          <Button
            size="icon"
            variant="ghost"
            disabled={!replyText.trim() || isSendingReply}
            onClick={handleSendReply}
            className="shrink-0 h-8 w-8 self-end"
          >
            {isSendingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

      {/* ── Reply dialog (mobile only) ── */}
      <CommentDialog
        isOpen={isReplyDialogOpen && isMobile}
        onOpenChange={setIsReplyDialogOpen}
        onConfirmComment={handleDialogReply}
        postTitle={undefined}
        parentAuthorName={comment.authorName}
      />

      {/* ── Nested replies ── */}
      {comment.replies && comment.replies.length > 0 && (
        <div className={cn(
          isFlat
            ? "border-l md:border-l-2 pl-2 md:pl-1 ml-0 md:ml-3 border-muted-foreground/20 md:border-muted/50"
            : "border-l-2 pl-1 pb-2 mt-2 border-muted/50",
          !isFlat && (level >= 3 ? "ml-1 md:ml-3" : "ml-3")
        )}>
          {comment.replies.map(reply => (
            <CommentCard
              key={reply.id}
              comment={reply}
              postId={postId}
              level={level + 1}
              currentUserId={currentUserId}
              postAuthorId={postAuthorId}
              onCommentAdded={onCommentAdded}
              tribeId={tribeId}
              isPublic={isPublic}
            />
          ))}
        </div>
      )}

      {/* ── Block dialog ── */}
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
            await blockUser(comment.authorId, 'Blocked from post comment');
            window.location.reload();
          } catch (err) {
            console.error('Block failed:', err);
            toast({ title: 'Block failed', description: 'Could not block this user. Please try again.', variant: 'destructive' });
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
