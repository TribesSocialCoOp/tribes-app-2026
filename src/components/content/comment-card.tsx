"use client";

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { Smile, MoreVertical, MoreHorizontal, Flag, UserRoundX, Pencil, Check, X, Send, Loader2, Lock } from "lucide-react";
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { cn } from '@/lib/utils';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { useIsMobile } from "@/hooks/use-mobile";
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { toggleVibe, createComment, editComment, reportComment } from '@/lib/actions/content-actions';
import { useToast } from '@/hooks/use-toast';
import type { DiscussionComment } from '@/lib/types';
import Link from 'next/link';
import { profilePath } from '@/lib/utils/paths';

interface CommentCardProps {
  comment: DiscussionComment;
  postId: string;
  level?: number;
  currentUserId?: string | null;
  onCommentAdded: () => void; // callback to reload comments after reply
  tribeId?: string; // needed for comment decryption + encryption of replies
  isPublic?: boolean; // tribe public flag — false means comments should be encrypted
}

/**
 * Shared interactive comment card.
 * Supports: vibes, reply-to-comment, edit own comment, report, block.
 */
export const CommentCard: React.FC<CommentCardProps> = ({
  comment, postId, level = 0, currentUserId, onCommentAdded, tribeId, isPublic = true,
}) => {
  const { toast } = useToast();
  const isOwnComment = comment.authorId === currentUserId;
  const emoticons = VIBE_EMOTICONS;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const isMobile = useIsMobile();
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

  // ── Vibes ──
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [vibeCount, setVibeCount] = useState(comment.vibes || 0);

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
        const cachedTribeKey = await getTribeKey(tribeId);
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
  }, [comment.id, comment.isEncrypted, comment.ciphertextBase64, comment.encryptionIv, tribeId]);

  // ── Opportunistic backfill: encrypt legacy plaintext comments ──
  useEffect(() => {
    // Only backfill if: comment is NOT encrypted, tribe is private, and we have plaintext content
    if (comment.isEncrypted || isPublic || !tribeId || !comment.content || comment.content === '[encrypted]') return;

    let active = true;
    async function backfill() {
      try {
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = await getTribeKey(tribeId!);
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
  }, [comment.id, comment.isEncrypted, comment.content, isPublic, tribeId]);

  // ── Reply ──
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);

  // ── Block ──
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);

  const handleVibeSelection = async (vibe: string) => {
    const wasSelected = selectedVibe === vibe;
    const prevCount = vibeCount;
    setSelectedVibe(wasSelected ? null : vibe);
    setVibeCount(wasSelected ? prevCount - 1 : prevCount + 1);
    try {
      const result = await toggleVibe(comment.id, 'comment', vibe);
      setSelectedVibe(result.vibed ? vibe : null);
      setVibeCount(result.newCount ?? vibeCount);
    } catch {
      setSelectedVibe(wasSelected ? vibe : null);
      setVibeCount(prevCount);
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

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    try {
      // Encrypt reply for private tribes
      let encPayload: { ciphertextBase64: string; iv: string } | undefined;
      if (!isPublic && tribeId) {
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = await getTribeKey(tribeId);
        if (!cachedTribeKey) {
          throw new Error('Encryption keys have not synced yet. Please wait a moment and try again.');
        }
        const { encryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
        const { toBase64 } = await import('@/lib/crypto/encoding');
        const encrypted = await encryptWithTribeKey(replyText.trim(), cachedTribeKey.key);
        encPayload = {
          ciphertextBase64: toBase64(encrypted.ciphertext),
          iv: encrypted.iv,
        };
      }

      const result = await createComment(postId, replyText.trim(), comment.id, encPayload);
      if (result && typeof result === 'object' && 'serverError' in result) {
        throw new Error(result.serverError as string);
      }
      toast({ title: 'Reply sent' });
      setReplyText('');
      setShowReply(false);
      onCommentAdded();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to send reply';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setIsSendingReply(false);
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

          {/* Content / Edit mode */}
          {isEditing ? (
            <div className="mt-1.5 space-y-2">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                className="min-h-[60px] text-sm resize-none"
                autoFocus
              />
              <div className="flex items-center gap-2 justify-end">
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsEditing(false)} disabled={isSavingEdit}>
                  <X className="mr-1 h-3 w-3" /> Cancel
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit} disabled={isSavingEdit || !editContent.trim()}>
                  {isSavingEdit ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Check className="mr-1 h-3 w-3" />}
                  Save
                </Button>
              </div>
            </div>
          ) : (
            <>
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
              <p className="text-sm whitespace-pre-line mt-1 text-foreground">{displayContent}</p>
            )}
            </>
          )}
        </div>
      </div>

      {/* ── Action buttons: vibe + reply ── */}
      <div className={cn("flex items-center space-x-2 text-xs mt-1", isDeep ? "ml-1 md:ml-9" : "ml-11")}>
        {currentUserId ? (
          <>
            <Popover open={popoverOpen} onOpenChange={(isOpen) => {
              setPopoverOpen(isOpen);
              if (!isOpen) setShowFullPicker(false);
            }}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "px-1 text-muted-foreground hover:text-primary h-6 text-xs transition-colors",
                    selectedVibe && "bg-primary/10 text-primary hover:bg-primary/20 rounded-full px-2"
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
              <PopoverContent
                className="w-auto p-2"
                side="top"
                align="start"
                onOpenAutoFocus={(e) => e.preventDefault()}
              >
                {showFullPicker && !isMobile ? (
                  <EmojiPicker
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      handleVibeSelection(emojiData.emoji);
                      setPopoverOpen(false);
                      setShowFullPicker(false);
                    }}
                    theme={isDark ? Theme.DARK : Theme.LIGHT}
                    emojiStyle={EmojiStyle.NATIVE}
                    height={350}
                    width={320}
                    searchPlaceholder="Search emoji..."
                    previewConfig={{ showPreview: false }}
                    lazyLoadEmojis
                    autoFocusSearch={true}
                  />
                ) : (
                  <div className="flex space-x-1 justify-center py-2">
                    {emoticons.map((emo) => (
                      <Button
                        key={emo}
                        variant="ghost"
                        size="icon"
                        className="text-xl p-1.5 h-auto w-auto rounded-md hover:bg-accent"
                        onClick={() => {
                          handleVibeSelection(emo);
                          setPopoverOpen(false);
                        }}
                      >
                        {emo}
                      </Button>
                    ))}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-sm p-1.5 h-auto w-auto rounded-md hover:bg-accent text-muted-foreground"
                      onClick={() => {
                        if (isMobile) {
                          setPopoverOpen(false);
                          setDrawerOpen(true);
                        } else {
                          setShowFullPicker(true);
                        }
                      }}
                      aria-label="More emoji"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>

            {/* Full emoji picker drawer (mobile only) */}
            <Drawer open={drawerOpen} onOpenChange={setDrawerOpen}>
              <DrawerContent className="px-0 pb-safe">
                <DrawerTitle className="sr-only">Choose an emoji</DrawerTitle>
                <div className="flex justify-center w-full px-2 py-3">
                  <EmojiPicker
                    onEmojiClick={(emojiData: EmojiClickData) => {
                      handleVibeSelection(emojiData.emoji);
                      setDrawerOpen(false);
                    }}
                    theme={isDark ? Theme.DARK : Theme.LIGHT}
                    emojiStyle={EmojiStyle.NATIVE}
                    height={420}
                    width="100%"
                    searchPlaceholder="Search emoji..."
                    previewConfig={{ showPreview: false }}
                    lazyLoadEmojis
                    autoFocusSearch={false}
                  />
                </div>
              </DrawerContent>
            </Drawer>

            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReply(!showReply)}
              className="px-1 text-muted-foreground hover:text-primary h-6 text-xs"
            >
              Reply
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" className="px-1 text-muted-foreground h-6 text-xs pointer-events-none">
            <Smile className="mr-1 h-3.5 w-3.5" />
            {vibeCount}
          </Button>
        )}
      </div>

      {/* ── Inline reply to this comment ── */}
      {showReply && (
        <div className={cn("mt-2 flex gap-2", isDeep ? "ml-1 md:ml-9" : "ml-11")}>
          <Input
            placeholder={`Reply to ${comment.authorName}...`}
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
            className="text-sm h-8"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            disabled={!replyText.trim() || isSendingReply}
            onClick={handleSendReply}
            className="shrink-0 h-8 w-8"
          >
            {isSendingReply ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          </Button>
        </div>
      )}

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
    </div>
  );
};
