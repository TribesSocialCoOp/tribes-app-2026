
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareText, Smile, Filter as FilterIcon, Settings2, Loader2, Send, Megaphone } from 'lucide-react';
import { moodsData } from '@/lib/moods-data'; 
import { cn } from '@/lib/utils';
import { useTimeSince } from '@/hooks/use-time-since';
import type { MoodStreamPost, DiscussionComment } from '@/lib/types';
import { getMoodStreamPosts, toggleVibe, createComment, getCommentsForPost } from '@/lib/actions/content-actions';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { VIBE_EMOTICONS } from '@/lib/constants';

const CommentInline: React.FC<{ comment: DiscussionComment; level?: number }> = ({ comment, level = 0 }) => (
  <div className={level > 0 ? 'ml-6 border-l-2 pl-3' : ''}>
    <div className="flex items-start gap-2">
      <Avatar className="h-6 w-6 mt-0.5">
        {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />}
        <AvatarFallback className="text-[10px]">{comment.authorAvatarFallback}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-semibold">{comment.authorName}</span>
          <span className="text-[10px] text-muted-foreground">{format(comment.timestamp, 'MMM d, h:mm a')}</span>
        </div>
        <p className="text-sm text-foreground whitespace-pre-line">{comment.content}</p>
      </div>
    </div>
    {comment.replies && comment.replies.length > 0 && (
      <div className="mt-2 space-y-2">
        {comment.replies.map(reply => (
          <CommentInline key={reply.id} comment={reply} level={level + 1} />
        ))}
      </div>
    )}
  </div>
);

const MoodStreamPostCard: React.FC<{ post: MoodStreamPost }> = ({ post }) => {
  const router = useRouter();
  const { role } = useUser();
  const { toast } = useToast();
  const isLoggedIn = !!role;
  const displayTime = useTimeSince(post.timestamp);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [vibeCount, setVibeCount] = useState(post.vibes ?? 0);
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [loadedComments, setLoadedComments] = useState<DiscussionComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments ?? 0);
  const emoticons = VIBE_EMOTICONS;

  const handleVibeSelection = async (vibe: string) => {
    if (!isLoggedIn) return;
    const wasSelected = selectedVibe === vibe;
    setSelectedVibe(wasSelected ? null : vibe);
    setVibeCount(prev => wasSelected ? Math.max(0, prev - 1) : prev + 1);
    try {
      const result = await toggleVibe(post.id, 'post', vibe);
      setVibeCount(result.newCount);
      setSelectedVibe(result.vibed ? vibe : null);
    } catch {
      setSelectedVibe(wasSelected ? vibe : null);
      setVibeCount(post.vibes ?? 0);
    }
  };

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const comments = await getCommentsForPost(post.id);
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
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    try {
      await createComment(post.id, replyText.trim());
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

  return (
    <Card className="overflow-hidden shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200">
      <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10">
            {post.authorAvatarSrc && <AvatarImage src={post.authorAvatarSrc} alt={post.author} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
            <AvatarFallback>{post.authorAvatarFallback || post.author.substring(0,2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold leading-tight tracking-normal">
                {post.author} {post.tribeName && <span className="text-xs text-muted-foreground font-normal">in <Link href={`/tribes/${post.tribeId}`} className="font-medium text-primary hover:underline">{post.tribeName}</Link></span>}
            </CardTitle>
            <CardDescription className="text-xs">{displayTime}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-1 sm:pt-2">
        {post.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-normal">{post.title}</h3>}
        {post.imageUrl && (
          <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-md border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={post.imageUrl} 
              alt={post.imageAlt || "Mood stream media"} 
              className="w-full h-full object-cover"
              data-ai-hint={post.dataAiHintImage || "media content"}
            />
          </div>
        )}
        <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{post.content}</p>
        {post.promotedByName && (
          <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
            <Megaphone className="h-3 w-3" /> Promoted by {post.promotedByName}
          </p>
        )}
      </CardContent>
      {(post.vibes !== undefined || post.comments !== undefined) && (
        <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start space-x-4 border-t">
          {post.vibes !== undefined && (
            isLoggedIn ? (
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
            ) : (
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-muted-foreground hover:text-primary"
                onClick={() => router.push('/signup')}
              >
                <Smile className="mr-1.5 h-4 w-4" />
                {vibeCount}
              </Button>
            )
          )}
          {isLoggedIn && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary"
              onClick={handleToggleComments}
            >
              {isLoadingComments ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <MessageSquareText className="mr-1.5 h-4 w-4" />
              )}
              {commentCount}
            </Button>
          )}
          {isLoggedIn && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary"
              onClick={() => setShowReply(!showReply)}
            >
              <Send className="mr-1.5 h-4 w-4" /> Reply
            </Button>
          )}
        </CardFooter>
      )}
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


export default function MoodStreamPage() {
  const router = useRouter();
  const params = useParams();
  const moodSlugFromUrl = params.moodSlug as string;

  const [allPosts, setAllPosts] = useState<MoodStreamPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMoodSlugs, setSelectedMoodSlugs] = useState<string[]>(moodSlugFromUrl ? [moodSlugFromUrl] : []);

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        const posts = await getMoodStreamPosts();
        setAllPosts(posts);
        setIsLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (moodSlugFromUrl && (selectedMoodSlugs.length !== 1 || selectedMoodSlugs[0] !== moodSlugFromUrl)) {
      setSelectedMoodSlugs([moodSlugFromUrl]);
    }
  }, [moodSlugFromUrl, selectedMoodSlugs]);

  const filteredPosts = useMemo(() => {
    if (selectedMoodSlugs.length === 0) return [];
    return allPosts.filter(post => 
        selectedMoodSlugs.some(slug => post.moodTags.includes(slug))
      )
      .sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [selectedMoodSlugs, allPosts]);

  
  const getHeaderInfo = () => {
    if (selectedMoodSlugs.length === 1) {
      const mood = moodsData.find(m => m.slug === selectedMoodSlugs[0]);
      return {
        title: mood ? `${mood.name} Stream` : "Mood Stream",
        Icon: mood?.icon || Smile,
        description: mood ? `Content curated for your '${mood.name.toLowerCase()}' mood.` : "Tune your mood to discover content."
      };
    } else if (selectedMoodSlugs.length > 1) {
      return {
        title: "Custom Mood Stream",
        Icon: Smile,
        description: `Content from ${selectedMoodSlugs.length} selected moods.`
      };
    }
    return {
      title: "Select Moods",
      Icon: Smile,
      description: "Tune your feed by selecting moods below."
    };
  };

  const { title: headerTitle, Icon: HeaderIcon, description: headerDescription } = getHeaderInfo();

  return (
    <div className="space-y-4 md:space-y-6 relative">
      <header className="mb-4 md:mb-6 pt-4"> 
        <div className="flex items-center space-x-2 mb-1">
            <HeaderIcon className="h-7 w-7 md:h-8 md:w-8 text-primary" /> 
            <h1 className="text-2xl md:text-3xl font-bold tracking-normal text-foreground font-mono">
             {headerTitle}
            </h1>
        </div>
        <p className="text-md md:text-lg text-muted-foreground">
          {headerDescription}
        </p>
      </header>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : filteredPosts.length > 0 ? (
        <div className="space-y-4 md:space-y-5">
          {filteredPosts.map(post => (
            <MoodStreamPostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <Card className="text-center py-12 shadow-none sm:shadow-lg">
            <CardContent className="p-4 sm:p-6">
                <HeaderIcon className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground opacity-50 mb-4 sm:mb-6" /> 
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 tracking-normal">
                    {selectedMoodSlugs.length > 0 ? "No posts for your selected moods yet!" : "No moods selected!"}
                </h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                    {selectedMoodSlugs.length > 0 ? "Try different mood combinations or check back later." : "Open the tuner above to select moods and discover content."}
                </p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
