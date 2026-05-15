"use client";

import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { Smile, MoreVertical, MoreHorizontal, Flag, UserRoundX, Lock } from "lucide-react";
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { cn } from '@/lib/utils';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { useIsMobile } from "@/hooks/use-mobile";
import EmojiPicker, { EmojiClickData, Theme, EmojiStyle } from 'emoji-picker-react';
import { toggleVibe } from '@/lib/actions/content-actions';
import type { DiscussionComment } from '@/lib/types';
import type { CommentContext } from './tribe-detail-context';
import Link from 'next/link';

interface CommentCardProps {
  comment: DiscussionComment;
  postId: string;
  level?: number;
  onReportComment: (comment: DiscussionComment) => void;
  onOpenReplyDialog: (context: CommentContext) => void;
  isLoggedIn: boolean;
  isMember: boolean;
  currentUserId?: string | null;
  tribeId?: string;
}

export const CommentCard: React.FC<CommentCardProps> = ({
  comment, postId, level = 0,
  onReportComment, onOpenReplyDialog, isLoggedIn, isMember, currentUserId, tribeId,
}) => {
  const isCurrentUserAuthor = comment.authorId === currentUserId;
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [vibeCount, setVibeCount] = useState(comment.vibes || 0);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const emoticons = VIBE_EMOTICONS;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showFullPicker, setShowFullPicker] = useState(false);
  const isMobile = useIsMobile();
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');

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
    if (comment.isEncrypted || !tribeId || !comment.content || comment.content === '[encrypted]') return;

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
  }, [comment.id, comment.isEncrypted, comment.content, tribeId]);

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

  // Progressive indentation: cap at ml-6 on mobile to preserve content width
  const INDENT_CLASSES = ["ml-0", "ml-3", "ml-5", "ml-6", "ml-6"] as const;
  const indentClass = INDENT_CLASSES[Math.min(level, INDENT_CLASSES.length - 1)];
  const isDeep = level >= 2; // Hide avatars on mobile at depth 2+
  const isFlat = level >= 4; // Stop nesting on mobile at depth 4+

  return (
    <div className={cn(isFlat ? "ml-0 md:ml-6" : indentClass)} id={`comment-${comment.id}`}>
      <div className={cn("flex items-start mt-3", isDeep ? "space-x-1 md:space-x-3" : "space-x-2 md:space-x-3")}>
        {/* Hide full avatar on mobile at depth 2+; show compact version on desktop only */}
        {isDeep ? (
          <>
            <div className="hidden md:block shrink-0">
              {!comment.authorIsAlias ? (
                <Link href={`/profile/${comment.authorId}`}>
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
            <Link href={`/profile/${comment.authorId}`}>
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
                <Link href={`/profile/${comment.authorId}`} className="hover:underline decoration-primary/30 underline-offset-2">
                  <p className="text-xs font-semibold truncate">{comment.authorName}</p>
                </Link>
              ) : (
                <p className="text-xs font-semibold truncate">{comment.authorName}</p>
              )}
              {/* Date inline on desktop / non-deep, separate line when deep+mobile */}
              {!isDeep && (
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">{format(comment.timestamp, "MMM d, h:mm a")}</p>
              )}
            </div>
            <div className="flex items-center space-x-2">
              {isDeep && (
                <p className="text-[10px] text-muted-foreground whitespace-nowrap">{format(comment.timestamp, "MMM d, h:mm a")}</p>
              )}
              {isLoggedIn && !isCurrentUserAuthor && (
                <ResponsiveMenu>
                  <ResponsiveMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 touch-target-44 text-muted-foreground">
                      <MoreVertical className="h-3.5 w-3.5" />
                    </Button>
                  </ResponsiveMenuTrigger>
                  <ResponsiveMenuContent align="end">
                    <ResponsiveMenuItem onClick={() => onReportComment(comment)}>
                      <Flag className="mr-2 h-4 w-4" /> Report
                    </ResponsiveMenuItem>
                    <ResponsiveMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setIsBlockDialogOpen(true)}
                    >
                      <UserRoundX className="mr-2 h-4 w-4" /> Block User
                    </ResponsiveMenuItem>
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
          {(!comment.isEncrypted || decryptionStatus === 'success') && (
            <p className="text-sm whitespace-pre-line mt-1">{displayContent}</p>
          )}
        </div>
      </div>
      <div className={cn("flex items-center space-x-2 text-xs", isDeep ? "ml-1 md:ml-9" : "ml-11")}>
        {isLoggedIn && isMember ? (
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
                  "px-1 text-muted-foreground hover:text-primary h-6 text-xs",
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
              tribeId={tribeId}
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
    </div>
  );
};
