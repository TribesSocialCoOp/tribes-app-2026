"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { VIBE_EMOTICONS } from '@/lib/constants';
import { useTimeSince } from '@/hooks/use-time-since';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MessageSquareText, User, HeartHandshake, Rss, Loader2, Smile, Send, Megaphone } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { toggleVibe, createComment, getCommentsForPost } from '@/lib/actions/content-actions';
import type { CommunicationItem, DiscussionComment } from '@/lib/types';
import { CommentInline } from './comment-inline';

export const IntercomFeedItem: React.FC<{ item: CommunicationItem }> = ({ item }) => {
  const { toast } = useToast();
  const displayTime = useTimeSince(item.timestamp);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [vibeCount, setVibeCount] = useState(item.vibes ?? 0);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [loadedComments, setLoadedComments] = useState<DiscussionComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState(0);
  const emoticons = VIBE_EMOTICONS;
  const isPost = item.type === 'mood-stream';

  const handleVibeSelection = async (vibe: string) => {
    if (!isPost) return;
    const wasSelected = selectedVibe === vibe;
    setSelectedVibe(wasSelected ? null : vibe);
    setVibeCount(prev => wasSelected ? Math.max(0, prev - 1) : prev + 1);
    try {
      const result = await toggleVibe(item.id, 'post', vibe);
      setVibeCount(result.newCount);
      setSelectedVibe(result.vibed ? vibe : null);
    } catch {
      setSelectedVibe(wasSelected ? vibe : null);
      setVibeCount(item.vibes ?? 0);
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
      await createComment(item.id, replyText.trim());
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

  let icon = <MessageSquareText className="h-5 w-5 text-primary" />;
  let title = "";
  let subtitle = "";
  let body = "";
  if (item.type === "family-bond" || item.type === "regular-bond") {
    icon = item.type === "family-bond"
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
  }

  return (
    <Card className="shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200 overflow-hidden">
      <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10">
            {item.avatarSrc && <AvatarImage src={item.avatarSrc} alt={item.sender || item.tribeName || "Avatar"} data-ai-hint={item.dataAiHint || "avatar"} />}
            <AvatarFallback>{item.avatarFallback || "N/A"}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold tracking-normal">{title}</CardTitle>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{displayTime}</span>
            </div>
            <CardDescription className="text-xs">
              {subtitle}
              {item.type === 'mood-stream' && item.tribeName && (
                <> • from <Link href={`/tribes/${item.tribeId}`} className="font-medium text-primary hover:underline">{item.tribeName}</Link></>
              )}
            </CardDescription>
          </div>
          <div className="ml-auto pl-2 text-muted-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-2 sm:pt-3">
        {item.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-tight">{item.title}</h3>}
        {item.imageUrl && (
          <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-md">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={item.imageUrl}
              alt={item.imageAlt || "Communication media"}
              className="w-full h-full object-cover"
              data-ai-hint={item.dataAiHintImage || "media content"}
            />
          </div>
        )}
        {body && <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{body}</p>}
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
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                {selectedVibe ? (
                  <span className="text-lg mr-1.5">{selectedVibe}</span>
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
    </Card>
  );
};
