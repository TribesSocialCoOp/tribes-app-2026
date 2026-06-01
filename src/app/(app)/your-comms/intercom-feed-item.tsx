"use client";

import React, { useState, useRef } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import Link from 'next/link';
import { profilePath } from '@/lib/utils/paths';
import Image from 'next/image';
import { VibePicker } from '@/components/ui/vibe-picker';
import { useTimeSince } from '@/hooks/use-time-since';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { MessageSquareText, Rss, Loader2, Smile, Send, Megaphone, Pin, Lock, Trash2, Pencil, MoreVertical, Flag, UserRoundX, Link2, ShieldAlert } from "lucide-react";
import { cn, countAllComments, insertReplyIntoTree } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { toggleVibe, createComment, getCommentsForPost, togglePinToWall, deleteOwnPost } from '@/lib/actions/content-actions';
import type { CommunicationItem, DiscussionComment } from '@/lib/types';
import { MarkdownContent, getReferencedImageIndices } from '@/components/ui/markdown-content';
import { useIntercom } from './intercom-context';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { EncryptedImage } from '@/components/ui/encrypted-image';
import { LinkPreviewCard } from '@/components/ui/link-preview-card';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { CommentDialog } from '@/components/dialogs/comment-dialog';
import { RoleBadge } from '@/components/ui/role-badge';
import { buildPostPath } from '@/lib/utils/slugify';
import { CommentCard } from '@/components/content/comment-card';
import { PinToWallDialog } from '@/components/dialogs/pin-to-wall-dialog';
import { ModRemovalDialog } from '@/components/dialogs/mod-removal-dialog';


export const IntercomFeedItem: React.FC<{ item: CommunicationItem }> = ({ item }) => {
  const { toast } = useToast();
  const { user } = useUser();
  const { handleOpenEditPostDialog } = useIntercom();
  const displayTime = useTimeSince(item.timestamp);
  const [localRecentVibes, setLocalRecentVibes] = useState<{ emoji: string, count: number }[] | null>(null);
  const [localHasVibed, setLocalHasVibed] = useState<boolean | null>(null);
  const [vibeCount, setVibeCount] = useState(item.vibes ?? 0);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [loadedComments, setLoadedComments] = useState<DiscussionComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState(item.comments ?? 0);
  const [isPinned, setIsPinned] = useState(item.pinnedToWall ?? false);
  const [isPinning, setIsPinning] = useState(false);
  const [isDeleted, setIsDeleted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const isPost = item.type === 'mood-stream' || item.type === 'ring-post';
  const isOwnPost = isPost && !!user?.id && item.authorId === user.id;
  const isTribeSpeaker = item.currentUserTribeRole ? ['founder', 'platform_admin', 'speaker'].includes(item.currentUserTribeRole) : false;
  const replyRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();
  const isGlobalAdmin = user?.role === 'Admin';
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [modRemoveOpen, setModRemoveOpen] = useState(false);
  const [isAdminDeleteDialogOpen, setIsAdminDeleteDialogOpen] = useState(false);


  const currentRecentVibes = localRecentVibes !== null ? localRecentVibes : (item.recentVibes || []);
  const currentUserHasVibed = localHasVibed !== null ? localHasVibed : (item.hasVibed || false);

  const handleVibeSelection = async (vibe: string) => {
    if (!isPost) return;
    
    // Optimistic update
    const isRemoving = currentUserHasVibed;
    const newCount = isRemoving ? Math.max(0, vibeCount - 1) : vibeCount + 1;
    
    setLocalHasVibed(!isRemoving);
    setVibeCount(newCount);

    try {
      const result = await toggleVibe(item.id, 'post', vibe);
      setLocalHasVibed(result.vibed);
      setVibeCount(result.newCount);
      if (result.recentVibes) {
        setLocalRecentVibes(result.recentVibes);
      }
    } catch {
      // Revert optimistic update on failure
      setLocalHasVibed(currentUserHasVibed);
      setVibeCount(vibeCount);
    }
  };

  const loadComments = async () => {
    if (!isPost) return;
    setIsLoadingComments(true);
    try {
      const comments = await getCommentsForPost(item.id);
      setLoadedComments(comments);
      setCommentCount(countAllComments(comments));
    } catch { /* ignore */ } finally {
      setIsLoadingComments(false);
    }
  };

  const handleCommentAdded = (newReply?: DiscussionComment) => {
    if (newReply) {
      setLoadedComments(prev => insertReplyIntoTree(prev, newReply));
      setCommentCount(prev => prev + 1);
    }
    loadComments();
  };

  const handleToggleComments = async () => {
    if (!showComments && loadedComments.length === 0) {
      await loadComments();
    }
    setShowComments(!showComments);
  };

  const handleSendReply = async () => {
    if (!replyText.trim() || !isPost) return;
    setIsSendingReply(true);
    try {
      // Encrypt comment if post is encrypted (private tribe)
      let encPayload: { ciphertextBase64: string; iv: string } | undefined;
      if (item.isEncrypted && item.tribeId) {
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = await getTribeKey(item.tribeId);
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

      const result = await createComment(item.id, replyText.trim(), undefined, encPayload);
      if (result && typeof result === 'object' && 'serverError' in result) {
        throw new Error(result.serverError as string);
      }
      toast({ title: 'Reply sent', description: 'Your comment has been posted.' });
      setReplyText('');
      setShowReply(false);
      setLoadedComments(prev => [...prev, result as DiscussionComment]);
      setCommentCount(prev => prev + 1);
      setShowComments(true);
      loadComments();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSendingReply(false);
    }
  };

  // Hide deleted posts
  if (isDeleted) return null;

  let icon = <Rss className="h-5 w-5 text-primary" />;
  let title = "";
  let subtitle = "";
  let body = "";
  if (item.type === "mood-stream") {
    icon = <Rss className="h-5 w-5 text-accent" />;
    title = item.sender || "Unknown";
    subtitle = `in ${item.moodName || "Mood"} Stream`;
    body = item.content || "";
  } else if (item.type === "ring-post") {
    const ringLabels: Record<string, string> = {
      journal: '🪞 Journal',
      inner_circle: '❤️ Inner Circle',
      my_people: '🤝 My People',
      tribes: '👥 Tribes',
    };
    icon = item.pinnedToWall
      ? <Megaphone className="h-5 w-5 text-amber-500" />
      : <Rss className="h-5 w-5 text-primary" />;
    title = item.sender || "Unknown";
    subtitle = item.pinnedToWall
      ? `📌 Wall update`
      : (item.ring ? ringLabels[item.ring] || 'Post' : 'Post');
    if (item.moodName) subtitle += ` • ${item.moodName}`;
    if (item.isEncrypted) subtitle += ' 🔒';
    body = item.content || "";
  }



  const cardContent = (
    <Card 
      id={`post-${item.id}`}
      className="shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200 overflow-hidden"
    >
      <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start space-x-3">
          {!item.authorIsAlias && item.authorId ? (
            <Link href={profilePath(item.authorId!, item.authorSlug)}>
              <UserAvatar 
                user={{ name: item.sender || item.tribeName, avatar: item.avatarSrc }} 
                className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all" 
                fallback={item.avatarFallback || "N/A"}
                dataAiHint={item.dataAiHint || "avatar"}
              />
            </Link>
          ) : (
            <UserAvatar 
              user={{ name: item.sender || item.tribeName, avatar: item.avatarSrc }} 
              className="h-10 w-10" 
              fallback={item.avatarFallback || "N/A"}
              dataAiHint={item.dataAiHint || "avatar"}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                {!item.authorIsAlias && item.authorId ? (
                  <Link href={profilePath(item.authorId!, item.authorSlug)} className="hover:underline decoration-primary/30 underline-offset-2">
                    <CardTitle className="text-md font-semibold tracking-normal truncate">{title}</CardTitle>
                  </Link>
                ) : (
                  <Link href={buildPostPath(item.id, item.slug, item.tribeSlug)} className="hover:underline decoration-primary/30 decoration-2">
                    <CardTitle className="text-md font-semibold tracking-normal truncate">{title}</CardTitle>
                  </Link>
                )}
                {item.authorTribeRole && (
                  <RoleBadge role={item.authorTribeRole} tribeName={item.tribeName} showLabel={!isMobile} />
                )}
              </div>
              <span className="text-xs text-muted-foreground whitespace-nowrap hover:underline cursor-pointer">
                <Link href={buildPostPath(item.id, item.slug, item.tribeSlug)}>
                  {displayTime}
                </Link>
                {item.editedAt && <span className="ml-1 opacity-70" title={`Edited ${item.editedAt.toLocaleString()}`}>(edited)</span>}
              </span>
            </div>
            <CardDescription className="text-xs">
              {subtitle}
              {(item.type === 'mood-stream' || item.type === 'ring-post') && item.tribeName && (
                <> • from <Link href={`/tribes/${item.tribeId}`} className="font-medium text-primary hover:underline">{item.tribeName}</Link></>
              )}
            </CardDescription>
          </div>
          <div className="ml-auto pl-2 text-muted-foreground flex items-center gap-1">
            {isPost && (
              <>
                <Link href={buildPostPath(item.id, item.slug, item.tribeSlug)} className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted transition-colors" title="View Post">
                  <Link2 className="h-4 w-4" />
                </Link>
                <ResponsiveMenu>
                  <ResponsiveMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 touch-target-44 text-muted-foreground -mr-2">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </ResponsiveMenuTrigger>
                  <ResponsiveMenuContent align="end">
                  <ResponsiveMenuItem onClick={() => {
                    const url = `${window.location.origin}${buildPostPath(item.id, item.slug, item.tribeSlug)}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: 'Link copied', description: 'Post link copied to clipboard.' });
                  }}>
                    <Link2 className="mr-2 h-4 w-4" /> Copy Link
                  </ResponsiveMenuItem>
                  <ResponsiveMenuSeparator />
                  {isTribeSpeaker && item.type === 'ring-post' && item.tribeId && (
                    <>
                      <ResponsiveMenuItem onClick={async () => {
                          try {
                            const { togglePinTribePost } = await import('@/lib/actions/content-actions');
                            const { pinned } = await togglePinTribePost(item.id);
                            toast({ 
                              title: pinned ? 'Post Pinned' : 'Post Unpinned', 
                              description: pinned ? 'This post will stay at the top of the tribe feed.' : 'Post unpinned from top.' 
                            });
                          } catch (err: unknown) {
                            toast({ variant: 'destructive', title: 'Error', description: 'Failed to toggle pin.' });
                          }
                      }}>
                        <Pin className="mr-2 h-4 w-4" /> Pin to Tribe Top
                      </ResponsiveMenuItem>
                      <ResponsiveMenuSeparator />
                    </>
                  )}
                  {!isOwnPost && (
                    <>
                      <ResponsiveMenuItem onClick={async () => {
                         try {
                           const { reportPost } = await import('@/lib/actions/content-actions');
                           await reportPost({
                             postId: item.id,
                             postTitle: item.title,
                             reporterName: user?.name || 'Anonymous',
                             reason: 'Reported from feed',
                           });
                           toast({ title: 'Post Reported', description: 'An admin will review it.' });
                         } catch (e) {
                           toast({ variant: 'destructive', title: 'Error', description: 'Failed to report.' });
                         }
                      }}>
                        <Flag className="mr-2 h-4 w-4" /> Report Post
                      </ResponsiveMenuItem>
                      <ResponsiveMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setIsBlockDialogOpen(true)}
                      >
                        <UserRoundX className="mr-2 h-4 w-4" /> Block User
                      </ResponsiveMenuItem>
                    </>
                  )}
                  {isOwnPost && (
                    <>
                      <ResponsiveMenuItem onClick={() => handleOpenEditPostDialog(item)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Post
                      </ResponsiveMenuItem>
                      {!isGlobalAdmin && (
                        <ResponsiveMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Post
                        </ResponsiveMenuItem>
                      )}
                    </>
                  )}
                  {isTribeSpeaker && !isOwnPost && item.tribeId && (
                    <ResponsiveMenuItem className="text-destructive focus:text-destructive" onClick={() => setModRemoveOpen(true)}>
                      <ShieldAlert className="mr-2 h-4 w-4" /> Remove Post (Mod)
                    </ResponsiveMenuItem>
                  )}
                  {isGlobalAdmin && (
                    <ResponsiveMenuItem className="text-destructive focus:text-destructive" onClick={() => setIsAdminDeleteDialogOpen(true)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Post (Admin)
                    </ResponsiveMenuItem>
                  )}
                </ResponsiveMenuContent>
              </ResponsiveMenu>
            </>
          )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-2 sm:pt-3">
        {item.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-tight">{item.title}</h3>}
        {/* Multi-image support — only show images NOT referenced inline via [img:N] */}
        {(() => {
          const allImages = item.imageUrls?.length ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : []);
          const inlineRefs = body ? getReferencedImageIndices(body) : new Set<number>();
          const headerImages = allImages.filter((_, idx) => !inlineRefs.has(idx + 1));
          
          if (headerImages.length > 0) {
            return (
              <div className={cn(
                "mb-3 grid gap-2 overflow-hidden rounded-md border bg-muted/20",
                headerImages.length === 1 ? "grid-cols-1" :
                  headerImages.length === 2 ? "grid-cols-2" :
                    headerImages.length === 3 ? "grid-cols-2" :
                      "grid-cols-2"
              )}>
                {headerImages.map((urlOrId, idx) => {
                  // Find the original index in allImages for lightbox
                  const origIdx = allImages.indexOf(urlOrId);
                  return (
                    <div 
                      key={idx} 
                      className={cn(
                        "relative overflow-hidden cursor-pointer group",
                        headerImages.length === 1
                          ? "flex items-center justify-center max-h-[500px]"
                          : "aspect-square",
                        headerImages.length === 3 && idx === 0 && "row-span-2 aspect-auto"
                      )}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLightboxIndex(origIdx >= 0 ? origIdx : idx); setLightboxOpen(true); }}
                    >
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
                      {item.isEncrypted ? (
                        <EncryptedImage fileId={urlOrId} postId={item.id} ring={item.ring} tribeId={item.tribeId} alt={`${item.imageAlt || "Communication media"} ${idx + 1}`} className={cn(
                          "transition-transform duration-300 group-hover:scale-105",
                          headerImages.length === 1
                            ? "max-w-full max-h-[500px] w-auto h-auto object-contain"
                            : "w-full h-full object-cover"
                        )} />
                      ) : (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={urlOrId} alt={`${item.imageAlt || "Communication media"} ${idx + 1}`} className={cn(
                          "transition-transform duration-300 group-hover:scale-105",
                          headerImages.length === 1
                            ? "max-w-full max-h-[500px] w-auto h-auto object-contain"
                            : "w-full h-full object-cover"
                        )} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          }
          return null;
        })()}
        {body && <MarkdownContent
          content={body}
          imageUrls={item.imageUrls?.length ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : undefined)}
          isEncrypted={item.isEncrypted}
          postId={item.id}
          ring={item.ring}
          tribeId={item.tribeId}
          onImageClick={(idx) => { setLightboxIndex(idx); setLightboxOpen(true); }}
        />}
        {/* Link preview card */}
        {item.linkUrl && (
          <div className="mt-2">
            <LinkPreviewCard
              url={item.linkUrl}
              title={item.linkTitle}
              description={item.linkDescription}
              imageUrl={item.linkImage}
              siteName={item.linkSiteName}
            />
          </div>
        )}
        {item.promotedByName && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Megaphone className="h-3 w-3" /> Promoted by {item.promotedByName}
          </p>
        )}
      </CardContent>
      <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start space-x-4 border-t">
        {isPost && (
          <VibePicker
            vibeCount={vibeCount}
            recentVibes={currentRecentVibes}
            vibeDetails={item.vibeDetails}
            hasVibed={currentUserHasVibed}
            isAuthor={isOwnPost}
            onVibeSelect={handleVibeSelection}
          />
        )}
        {isPost && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={handleToggleComments}>
            {isLoadingComments ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-1.5 h-4 w-4" />}
            {commentCount}
          </Button>
        )}
        {isPost && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={() => {
            if (isMobile) {
              setReplyDialogOpen(true);
            } else {
              setShowReply(!showReply);
            }
          }}>
            <Send className="mr-1.5 h-4 w-4" /> Reply
          </Button>
        )}
        {/* Pin to Wall button — visible on all own posts */}
        {isOwnPost && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "text-muted-foreground hover:text-amber-600",
              isPinned && "text-amber-600"
            )}
            disabled={isPinning}
            onClick={async () => {
              if (item.isEncrypted && !isPinned) {
                setPinDialogOpen(true);
                return;
              }
              setIsPinning(true);
              try {
                const result = await togglePinToWall(item.id);
                setIsPinned(result.pinned);
                toast({
                  title: result.pinned ? "Pinned to Wall" : "Unpinned from Wall",
                  description: result.pinned ? "This post will now appear on your public wall." : "This post has been removed from your wall.",
                });
              } catch (error) {
                toast({
                  title: "Error",
                  description: "Failed to update wall status.",
                  variant: "destructive"
                });
              } finally {
                setIsPinning(false);
              }
            }}
          >
            {isPinning ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Pin className={cn("mr-1.5 h-4 w-4", isPinned && "fill-amber-600")} />
            )}
            {isPinned ? 'Pinned' : 'Pin to Wall'}
          </Button>
        )}
        {isOwnPost && confirmDelete && (
          <ConfirmActionDialog
            open={confirmDelete}
            onOpenChange={setConfirmDelete}
            title="Delete Post"
            description="Are you sure you want to permanently delete this post? This action cannot be undone."
            confirmText="Delete"
            destructive={true}
            onConfirm={async () => {
              setIsDeleting(true);
              try {
                await deleteOwnPost(item.id);
                setIsDeleted(true);
                toast({ title: 'Post deleted', description: 'Your post has been permanently removed.' });
              } catch (err) {
                toast({ title: 'Error', description: 'Could not delete post.', variant: 'destructive' });
              } finally {
                setIsDeleting(false);
                setConfirmDelete(false);
              }
            }}
          />
        )}
      </CardFooter>
      {showComments && loadedComments.length > 0 && (
        <div className="px-3 sm:px-4 pb-2 space-y-3 border-t pt-3">
          {loadedComments.map(comment => (
            <CommentCard 
              key={comment.id} 
              comment={comment} 
              postId={item.id} 
              currentUserId={user?.id}
              postAuthorId={item.authorId}
              onCommentAdded={handleCommentAdded}
              tribeId={item.tribeId}
              isPublic={!item.isEncrypted}
            />
          ))}
        </div>
      )}
      {showComments && loadedComments.length === 0 && !isLoadingComments && (
        <div className="px-3 sm:px-4 pb-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground text-center py-2">No comments yet — be the first to reply!</p>
        </div>
      )}
      {!isMobile && showReply && (
        <div ref={replyRef} className="px-3 sm:px-4 pb-3 sm:pb-4 flex gap-2">
          <Input
            placeholder="Write a reply..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
            className="text-sm"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            disabled={!replyText.trim() || isSendingReply}
            onClick={handleSendReply}
            className="shrink-0"
          >
            {isSendingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
      <CommentDialog
        isOpen={replyDialogOpen}
        onOpenChange={setReplyDialogOpen}
        onConfirmComment={async (content) => {
            try {
              // Encrypt comment if post is encrypted (private tribe)
              let encPayload: { ciphertextBase64: string; iv: string } | undefined;
              if (item.isEncrypted && item.tribeId) {
                const { getTribeKey } = await import('@/lib/crypto/key-store');
                const cachedTribeKey = await getTribeKey(item.tribeId);
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

              const result = await createComment(item.id, content.trim(), undefined, encPayload);
              if (result && typeof result === 'object' && 'serverError' in result) {
                throw new Error(result.serverError as string);
              }
              toast({ title: 'Reply sent', description: 'Your comment has been posted.' });
              setLoadedComments(prev => [...prev, result as DiscussionComment]);
              setCommentCount(prev => prev + 1);
              setShowComments(true);
              loadComments();
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : 'An unexpected error occurred';
              toast({ title: 'Error', description: message, variant: 'destructive' });
            }
        }}
        postTitle={item.title}
      />
      <ImageLightbox 
        images={item.imageUrls?.length ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : [])} 
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        isEncrypted={item.isEncrypted}
        postId={item.id}
        ring={item.ring}
        tribeId={item.tribeId}
      />

      <ConfirmActionDialog
        open={isBlockDialogOpen}
        onOpenChange={setIsBlockDialogOpen}
        title={`Block ${item.sender || 'this user'}?`}
        description="Are you sure you want to block this user? You will no longer see their posts or messages."
        confirmText="Block"
        destructive={true}
        onConfirm={async () => {
          try {
            if (!item.authorId) throw new Error('Cannot block: author unknown');
            const { blockUser } = await import('@/lib/actions/bond-actions');
            await blockUser(item.authorId, 'Blocked from intercom feed');
            window.location.reload();
          } catch (err) {
            console.error('Block failed:', err);
            toast({ title: 'Block failed', description: 'Could not block this user. Please try again.', variant: 'destructive' });
          }
        }}
      />

      <PinToWallDialog
        open={pinDialogOpen}
        onOpenChange={setPinDialogOpen}
        postId={item.id}
        decryptedContent={item.content ?? ''}
        decryptedTitle={item.title || undefined}
        onSuccess={() => setIsPinned(true)}
      />

      <ModRemovalDialog
        open={modRemoveOpen}
        onOpenChange={setModRemoveOpen}
        onConfirm={async (reason, preventRepost) => {
          try {
            const { removePost } = await import('@/lib/actions/content-actions');
            await removePost({ postId: item.id, reason, preventRepost });
            toast({ title: 'Post Removed', description: 'Content has been removed.' });
            setIsDeleted(true);
          } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to remove post.' });
          }
        }}
        postTitle={item.title || undefined}
      />

      <ConfirmActionDialog
        open={isAdminDeleteDialogOpen}
        onOpenChange={setIsAdminDeleteDialogOpen}
        title="Permanently Delete Post (Admin)"
        description="This will permanently delete this post and all associated data (comments, vibes, reports, encryption keys). Media files will be queued for cleanup after 30 days. This cannot be undone."
        confirmText="Delete Permanently"
        destructive={true}
        onConfirm={async () => {
          try {
            const { adminDeletePost } = await import('@/lib/actions/content-actions');
            await adminDeletePost(item.id);
            toast({ title: 'Post Permanently Deleted', description: 'The post and all associated data have been removed.' });
            setIsDeleted(true);
          } catch (err) {
            toast({ variant: 'destructive', title: 'Error', description: 'Failed to delete post.' });
          }
        }}
      />
    </Card>
  );
  return cardContent;
};
