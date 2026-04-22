"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Smile, SquareArrowUp, MessageSquareText, MoreVertical, Flag, Rss, RefreshCcw, Pin, Trash2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from '@/lib/utils';
import { useTimeSince } from '@/hooks/use-time-since';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { toggleVibe } from '@/lib/actions/content-actions';
import type { TribePost, DiscussionComment } from '@/lib/types';
import { CommentCard } from './comment-card';
import { useTribeDetail } from './tribe-detail-context';

interface TribePostCardProps {
  post: TribePost;
  isPromoted: boolean;
  isReported: boolean;
  isCurrentUserAuthor: boolean;
}

export const TribePostCard: React.FC<TribePostCardProps> = ({
  post, isPromoted, isReported, isCurrentUserAuthor,
}) => {
  const {
    state, isLoggedIn, currentUserId, isTribeAdmin, isTribeSpeaker,
    handleOpenPromoteDialog, handleOpenReportPostDialog,
    handleOpenRepostDialog, handleOpenReportCommentDialog,
    handleOpenCommentDialog, handleDeletePost,
  } = useTribeDetail();

  const router = useRouter();

  const isMember = state.isMember;
  const displayTime = useTimeSince(post.timestamp);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const emoticons = VIBE_EMOTICONS;

  const handleVibeSelection = async (vibe: string) => {
    const wasSelected = selectedVibe === vibe;
    setSelectedVibe(wasSelected ? null : vibe);
    try {
      const result = await toggleVibe(post.id, 'post', vibe);
      setSelectedVibe(result.vibed ? vibe : null);
    } catch {
      setSelectedVibe(wasSelected ? vibe : null);
    }
  };

  return (
    <Card className={cn(
      "overflow-hidden shadow-lg relative",
      isPromoted && "bg-accent/5 hover:bg-accent/10 border-accent/30",
      isReported && !post.isRemoved && "border-destructive/50 ring-2 ring-destructive/30",
      post.isPinned && "border-primary/50 ring-2 ring-primary/30"
    )}>
      {post.isRemoved && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 p-4 space-y-2">
          <Badge variant="destructive" className="text-md p-2 px-3">POST REMOVED</Badge>
          {isCurrentUserAuthor && post.canBeReposted !== false && (
            <Button variant="secondary" size="sm" onClick={() => handleOpenRepostDialog(post)} className="pointer-events-auto mt-2">
              <RefreshCcw className="mr-1.5 h-4 w-4" /> Repost
            </Button>
          )}
          {post.removalReason && (
            <p className="text-xs text-white/90 text-center italic max-w-xs bg-black/40 p-1.5 rounded mt-1">
              Reason: {post.removalReason}
            </p>
          )}
          {!post.canBeReposted && post.removalReason && (
            <p className="text-xs text-white/90 font-semibold text-center max-w-xs bg-destructive/50 p-1.5 rounded mt-1">
              Reposting of this content has been prevented by moderation.
            </p>
          )}
        </div>
      )}
      <div className={cn(post.isRemoved && "opacity-40 pointer-events-none")}>
        <CardHeader className="p-4 pb-2">
          <div className="flex items-start space-x-3">
            <Avatar className="h-10 w-10">
              {post.authorAvatar && <AvatarImage src={post.authorAvatar} alt={post.authorName} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
              <AvatarFallback>{post.authorAvatarFallback}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-md font-semibold tracking-normal">{post.authorName}</CardTitle>
              <div className="flex items-center space-x-2">
                <CardDescription className="text-xs">{displayTime}</CardDescription>
                {post.isPinned && (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <div className="flex items-center text-xs text-primary"><Pin className="h-3.5 w-3.5" /></div>
                  </TooltipTrigger><TooltipContent><p>Pinned Post</p></TooltipContent></Tooltip></TooltipProvider>
                )}
                {isMember && isPromoted && !post.isRemoved && (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <div className="flex items-center text-xs text-accent"><Rss className="h-3.5 w-3.5" /></div>
                  </TooltipTrigger><TooltipContent><p>Promoted to Mood Stream</p></TooltipContent></Tooltip></TooltipProvider>
                )}
                {isReported && !post.isRemoved && (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <div className="flex items-center text-xs text-destructive"><Flag className="h-3.5 w-3.5" /></div>
                  </TooltipTrigger><TooltipContent><p>This post has been reported and is under review.</p></TooltipContent></Tooltip></TooltipProvider>
                )}
              </div>
            </div>
            {isLoggedIn && !post.isRemoved && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isTribeSpeaker && (
                    <>
                      <DropdownMenuItem onClick={() => handleOpenPromoteDialog(post)} disabled={isPromoted}>
                        <Rss className="mr-2 h-4 w-4" /> {isPromoted ? "Already Promoted" : "Promote to Mood Stream"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {!isCurrentUserAuthor && (
                    <DropdownMenuItem onClick={() => handleOpenReportPostDialog(post)}>
                      <Flag className="mr-2 h-4 w-4" /> Report Post
                    </DropdownMenuItem>
                  )}
                  {isCurrentUserAuthor && (
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => handleDeletePost(post.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Post
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 pt-2">
          {post.title && <h3 className="text-xl font-semibold mb-2 text-foreground tracking-tight">{post.title}</h3>}
          {post.imageUrl && (
            <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-lg border">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={post.imageUrl} alt={post.imageAlt || "Post image"} className="w-full h-full object-cover" data-ai-hint={post.dataAiHintImage || "post image"} />
            </div>
          )}
          <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{post.content}</p>
          {(post.commentsData && post.commentsData.length > 0) && (
            <div className="mt-4 pt-3 border-t">
              {post.commentsData.map(comment => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  postId={post.id}
                  onReportComment={handleOpenReportCommentDialog}
                  onOpenReplyDialog={handleOpenCommentDialog}
                  isLoggedIn={isLoggedIn}
                  currentUserId={isCurrentUserAuthor ? post.authorId : undefined}
                />
              ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="p-4 pt-2 flex items-center justify-start space-x-4 border-t bg-muted/30">
          {isLoggedIn ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" disabled={post.isRemoved}>
                  {selectedVibe ? <span className="text-lg mr-1.5">{selectedVibe}</span> : <Smile className="mr-1.5 h-4 w-4" />}
                  {post.vibes || 0}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2">
                <div className="flex space-x-1">
                  {emoticons.map((emo) => (
                    <Button key={emo} variant="ghost" size="icon" className="text-xl p-1.5 h-auto w-auto rounded-md hover:bg-accent" onClick={() => handleVibeSelection(emo)}>
                      {emo}
                    </Button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          ) : (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" disabled={post.isRemoved} onClick={() => router.push('/signup')}>
              <Smile className="mr-1.5 h-4 w-4" /> {post.vibes || 0}
            </Button>
          )}
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" disabled={post.isRemoved} onClick={() => isLoggedIn && handleOpenCommentDialog({ postId: post.id, postTitle: post.title })}>
            <MessageSquareText className="mr-1.5 h-4 w-4" /> {post.comments || 0}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" disabled={post.isRemoved}>
            <SquareArrowUp className="mr-1.5 h-4 w-4" /> Share
          </Button>
        </CardFooter>
      </div>
    </Card>
  );
};
