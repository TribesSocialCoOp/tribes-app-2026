"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { useTimeSince } from '@/hooks/use-time-since';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MessageSquareText, User, HeartHandshake, Rss, Loader2, Smile, Send, Megaphone, Pin, Lock, Trash2, Pencil, MoreVertical, Flag } from "lucide-react";
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { toggleVibe, createComment, getCommentsForPost, togglePinToWall, deleteOwnPost } from '@/lib/actions/content-actions';
import type { CommunicationItem, DiscussionComment } from '@/lib/types';
import { CommentInline } from './comment-inline';
import { MarkdownContent } from '@/components/ui/markdown-content';
import { useIntercom } from './intercom-context';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { EncryptedImage } from '@/components/ui/encrypted-image';

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
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  const emoticons = VIBE_EMOTICONS;
  const isPost = item.type === 'mood-stream' || item.type === 'ring-post';
  const isOwnPost = isPost && !!user?.id && item.authorId === user.id;
  const isTribeSpeaker = item.currentUserTribeRole ? ['founder', 'platform_admin', 'speaker'].includes(item.currentUserTribeRole) : false;

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
      setCommentCount(comments.length);
    } catch { /* ignore */ } finally {
      setIsLoadingComments(false);
    }
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
      const result = await createComment(item.id, replyText.trim());
      if (result && typeof result === 'object' && 'serverError' in result) {
        throw new Error(result.serverError as string);
      }
      toast({ title: 'Reply sent', description: 'Your comment has been posted.' });
      setReplyText('');
      setShowReply(false);
      await loadComments();
      setShowComments(true);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSendingReply(false);
    }
  };

  // Hide deleted posts
  if (isDeleted) return null;

  let icon = <MessageSquareText className="h-5 w-5 text-primary" />;
  let title = "";
  let subtitle = "";
  let body = "";
  if (item.type === "inner-circle-bond" || item.type === "person-bond") {
    icon = item.type === "inner-circle-bond"
      ? <HeartHandshake className="h-5 w-5 text-pink-500" />
      : <User className="h-5 w-5 text-foreground" />;
    title = item.sender || "Unknown Sender";
    subtitle = `via ${item.bondName || "Direct Message"}`;
    body = item.message || "";
  } else if (item.type === "mood-stream") {
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

  const isBond = item.type === 'inner-circle-bond' || item.type === 'person-bond';
  const bondChatHref = isBond && item.bondId ? `/bonds/${item.bondId}` : undefined;

  const cardContent = (
    <Card className={cn(
      "shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200 overflow-hidden",
      isBond && "cursor-pointer hover:bg-accent/5 transition-colors"
    )}>
      <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start space-x-3">
          <UserAvatar 
            user={{ name: item.sender || item.tribeName, avatar: item.avatarSrc }} 
            className="h-10 w-10" 
            fallback={item.avatarFallback || "N/A"}
            dataAiHint={item.dataAiHint || "avatar"}
          />
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold tracking-normal">{title}</CardTitle>
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {displayTime}
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground -mr-2">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isTribeSpeaker && item.type === 'ring-post' && item.tribeId && (
                    <>
                      <DropdownMenuItem onClick={async () => {
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
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {!isOwnPost && (
                    <DropdownMenuItem onClick={async () => {
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
                    </DropdownMenuItem>
                  )}
                  {isOwnPost && (
                    <>
                      <DropdownMenuItem onClick={() => handleOpenEditPostDialog(item)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Post
                      </DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Post
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-2 sm:pt-3">
        {item.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-tight">{item.title}</h3>}
        {/* Multi-image support */}
        {item.imageUrls && item.imageUrls.length > 0 ? (
          <div className={cn(
            "mb-3 grid gap-2 overflow-hidden rounded-md border bg-muted/20",
            item.imageUrls.length === 1 ? "grid-cols-1" :
              item.imageUrls.length === 2 ? "grid-cols-2" :
                item.imageUrls.length === 3 ? "grid-cols-2" :
                  "grid-cols-2"
          )}>
            {item.imageUrls.map((urlOrId, idx) => (
              <div 
                key={idx} 
                className={cn(
                  "relative overflow-hidden cursor-pointer group",
                  item.imageUrls!.length === 1 ? "aspect-video" : "aspect-square",
                  item.imageUrls!.length === 3 && idx === 0 && "row-span-2 aspect-auto"
                )}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLightboxIndex(idx); setLightboxOpen(true); }}
              >
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
                {item.isEncrypted ? (
                  <EncryptedImage fileId={urlOrId} postId={item.id} alt={`${item.imageAlt || "Communication media"} ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={urlOrId} alt={`${item.imageAlt || "Communication media"} ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                )}
              </div>
            ))}
          </div>
        ) : item.imageUrl ? (
          <div 
            className="mb-3 relative aspect-video w-full overflow-hidden rounded-md bg-muted/20 cursor-pointer group"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setLightboxIndex(0); setLightboxOpen(true); }}
          >
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
            {item.isEncrypted ? (
              <EncryptedImage fileId={item.imageUrl} postId={item.id} alt={item.imageAlt || "Communication media"} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={item.imageUrl}
                alt={item.imageAlt || "Communication media"}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                data-ai-hint={item.dataAiHintImage || "media content"}
              />
            )}
          </div>
        ) : null}
        {body && <MarkdownContent content={body} />}
        {item.promotedByName && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Megaphone className="h-3 w-3" /> Promoted by {item.promotedByName}
          </p>
        )}
      </CardContent>
      <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start space-x-4 border-t">
        {isPost && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("text-muted-foreground hover:text-primary transition-all", currentUserHasVibed && "bg-primary/10 text-primary")}>
                {currentRecentVibes.length > 0 ? (
                  <div className="flex -space-x-1.5 mr-2">
                    {currentRecentVibes.map((rv, i) => (
                      <span key={i} className="text-base z-10 bg-background rounded-full leading-none p-[1px] shadow-sm relative">{rv.emoji}</span>
                    ))}
                  </div>
                ) : (
                  <Smile className="mr-1.5 h-4 w-4" />
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
        )}
        {isPost && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={handleToggleComments}>
            {isLoadingComments ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <MessageSquareText className="mr-1.5 h-4 w-4" />}
            {commentCount}
          </Button>
        )}
        {isPost && (
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" onClick={() => setShowReply(!showReply)}>
            <Send className="mr-1.5 h-4 w-4" /> Reply
          </Button>
        )}
        {/* Pin to Wall button — visible on own journal/ring posts */}
        {isPost && (item.ring === 'journal' || item.type === 'ring-post') && (
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              "text-muted-foreground hover:text-amber-600",
              isPinned && "text-amber-600"
            )}
            disabled={isPinning}
            onClick={async () => {
              setIsPinning(true);
              try {
                const result = await togglePinToWall(item.id);
                setIsPinned(result.pinned);
                toast({
                  title: result.pinned ? 'Pinned to Wall' : 'Unpinned from Wall',
                  description: result.pinned
                    ? 'This post now appears on your public wall.'
                    : 'This post has been removed from your wall.',
                });
              } catch {
                toast({ title: 'Error', description: 'Could not toggle pin.', variant: 'destructive' });
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
            {isPinned ? 'Pinned' : 'Pin'}
          </Button>
        )}
        {isOwnPost && confirmDelete && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="text-xs text-destructive font-medium">Delete permanently?</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              onClick={async () => {
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
            >
              {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Yes'}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
          </div>
        )}
      </CardFooter>
      {showComments && loadedComments.length > 0 && (
        <div className="px-3 sm:px-4 pb-2 space-y-3 border-t pt-3">
          {loadedComments.map(comment => (
            <CommentInline key={comment.id} comment={comment} />
          ))}
        </div>
      )}
      {showComments && loadedComments.length === 0 && !isLoadingComments && (
        <div className="px-3 sm:px-4 pb-3 pt-2 border-t">
          <p className="text-xs text-muted-foreground text-center py-2">No comments yet — be the first to reply!</p>
        </div>
      )}
      {showReply && (
        <div className="px-3 sm:px-4 pb-3 sm:pb-4 flex gap-2">
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
      <ImageLightbox 
        images={item.imageUrls?.length ? item.imageUrls : (item.imageUrl ? [item.imageUrl] : [])} 
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </Card>
  );
  // Wrap bond cards in a Link to the encrypted chat page
  if (bondChatHref) {
    return (
      <Link href={bondChatHref} className="block no-underline">
        {cardContent}
      </Link>
    );
  }

  return cardContent;
};
