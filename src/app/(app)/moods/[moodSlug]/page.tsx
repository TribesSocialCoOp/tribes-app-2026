
"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOptimisticVibes } from '@/hooks/use-optimistic-vibes';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { profilePath } from '@/lib/utils/paths';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { InlineReplyBox } from '@/components/content/inline-reply-box';
import { useIsMobile } from '@/hooks/use-mobile';
import { CommentDialog } from '@/components/dialogs/comment-dialog';
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareText, Smile, Filter as FilterIcon, Settings2, Loader2, Send, Megaphone, ChevronDown, ChevronRight } from 'lucide-react';
import { LoadMoreButton } from '@/components/ui/load-more-button';
import { moodsData } from '@/lib/moods-data'; 
import { cn, countAllComments } from '@/lib/utils';
import { ThreadCollapseHeader } from '@/components/content/thread-collapse-header';
import { useTimeSince } from '@/hooks/use-time-since';
import type { MoodStreamPost, DiscussionComment } from '@/lib/types';
import { getMoodStreamPosts, createComment, getCommentsForPost } from '@/lib/actions/content-actions';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { VibePicker } from '@/components/ui/vibe-picker';

const CommentInline: React.FC<{ comment: DiscussionComment; level?: number }> = ({ comment, level = 0 }) => (
  <div className={level > 0 ? 'ml-6 border-l-2 pl-3' : ''}>
    <div className="flex items-start gap-2">
      {!comment.authorIsAlias ? (
        <Link href={profilePath(comment.authorId, comment.authorSlug)}>
          <Avatar className="h-6 w-6 mt-0.5 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all">
            {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />}
            <AvatarFallback className="text-[10px]">{comment.authorAvatarFallback}</AvatarFallback>
          </Avatar>
        </Link>
      ) : (
        <Avatar className="h-6 w-6 mt-0.5">
          {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} />}
          <AvatarFallback className="text-[10px]">{comment.authorAvatarFallback}</AvatarFallback>
        </Avatar>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2">
          {!comment.authorIsAlias ? (
            <Link href={profilePath(comment.authorId, comment.authorSlug)} className="hover:underline decoration-primary/30 underline-offset-2">
              <span className="text-xs font-semibold">{comment.authorName}</span>
            </Link>
          ) : (
            <span className="text-xs font-semibold">{comment.authorName}</span>
          )}
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
  const { role, user } = useUser();
  const currentUserId = user?.id;
  const isCurrentUserAuthor = !!(currentUserId && currentUserId === post.authorId);
  const { toast } = useToast();
  const isLoggedIn = !!role;
  const displayTime = useTimeSince(post.timestamp);

  // ── Optimistic vibes (consolidated hook) ──
  const {
    vibeCount: currentVibesCount,
    recentVibes: currentRecentVibes,
    vibeDetails: currentVibeDetails,
    hasVibed: currentUserHasVibed,
    handleVibeSelection,
  } = useOptimisticVibes({
    targetId: post.id,
    targetType: 'post',
    serverVibeCount: post.vibes || 0,
    serverRecentVibes: post.recentVibes || [],
    serverVibeDetails: post.vibeDetails || [],
    serverHasVibed: post.hasVibed || false,
    serverSelectedVibe: post.selectedVibe ?? null,
    canSeeReactors: isCurrentUserAuthor,
    currentUserId,
    currentUserName: user?.name,
  });

  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const isMobile = useIsMobile();
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [loadedComments, setLoadedComments] = useState<DiscussionComment[]>([]);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments ?? 0);
  const [isBodyCollapsed, setIsBodyCollapsed] = useState(false);

  // Double-tap hook is not used here as collapse button is always visible

  const replyRef = useRef<HTMLDivElement>(null);

  const loadComments = async () => {
    setIsLoadingComments(true);
    try {
      const comments = await getCommentsForPost(post.id);
      setLoadedComments(comments);
      setCommentCount(countAllComments(comments));
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
      const result = await createComment(post.id, replyText.trim());
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

  return (
    <Card className="overflow-visible shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200">
      <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10 shrink-0">
            {post.authorAvatarSrc && <AvatarImage src={post.authorAvatarSrc} alt={post.author} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
            <AvatarFallback>{post.authorAvatarFallback || post.author.substring(0,2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold leading-tight tracking-normal">
                {post.author} {post.tribeName && <span className="text-xs text-muted-foreground font-normal">in <Link href={`/tribes/${post.tribeId}`} className="font-medium text-primary hover:underline">{post.tribeName}</Link></span>}
            </CardTitle>
            <CardDescription className="text-xs">
              {displayTime}
              {post.editedAt && (
                <span className="text-muted-foreground/70 ml-1" title={`Edited ${format(post.editedAt, 'MMM d, h:mm a')}`}>
                  (edited)
                </span>
              )}
            </CardDescription>
          </div>
          {/* Chevron to collapse/expand post body (always visible) */}
          <button
            onClick={() => setIsBodyCollapsed(!isBodyCollapsed)}
            className="flex p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted transition-colors items-center justify-center ml-auto"
            title={isBodyCollapsed ? "Expand post" : "Collapse post"}
          >
            {isBodyCollapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-1 sm:pt-2">
        {post.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-normal">{post.title}</h3>}
        {!isBodyCollapsed && (<>
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
        </>)}
      </CardContent>
      {(post.vibes !== undefined || post.comments !== undefined) && (
        <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start space-x-4 border-t">
          {post.vibes !== undefined && (
            isLoggedIn ? (
              <VibePicker
                vibeCount={currentVibesCount}
                recentVibes={currentRecentVibes}
                vibeDetails={currentVibeDetails}
                hasVibed={currentUserHasVibed}
                isAuthor={isCurrentUserAuthor}
                onVibeSelect={handleVibeSelection}
              />
            ) : (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-muted-foreground hover:text-primary"
                  onClick={() => router.push('/signup')}
                >
                  {currentRecentVibes.length > 0 ? (
                    <div className="flex -space-x-1.5 mr-2">
                      {currentRecentVibes.map((rv, i) => (
                        <span key={i} className="text-base z-10 bg-background rounded-full leading-none p-[1px] shadow-sm relative">{rv.emoji}</span>
                      ))}
                    </div>
                  ) : (
                    <Smile className="mr-1.5 h-4 w-4" />
                  )}
                  {currentVibesCount}
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
              onClick={() => {
                if (isMobile) {
                  setReplyDialogOpen(true);
                } else {
                  setShowReply(!showReply);
                }
              }}
            >
              <Send className="mr-1.5 h-4 w-4" /> Reply
            </Button>
          )}
        </CardFooter>
      )}
      {commentCount > 0 && (
        <div className="px-3 sm:px-4 border-t pt-2 pb-1">
          <ThreadCollapseHeader
            count={commentCount}
            isExpanded={showComments}
            onToggle={handleToggleComments}
          />
        </div>
      )}
      {showComments && loadedComments.length > 0 && (
        <div className="px-3 sm:px-4 pb-2 space-y-3">
          {loadedComments.map(comment => (
            <CommentInline key={comment.id} comment={comment} />
          ))}
        </div>
      )}
      {showComments && loadedComments.length === 0 && !isLoadingComments && (
        <div className={cn("px-3 sm:px-4 pb-3 pt-2", commentCount === 0 && "border-t")}>
          <p className="text-xs text-muted-foreground text-center py-2">No comments yet — be the first to reply!</p>
        </div>
      )}
      {!isMobile && showReply && (
        <InlineReplyBox
          ref={replyRef}
          value={replyText}
          onChange={setReplyText}
          onSend={handleSendReply}
          isSending={isSendingReply}
          onFocus={() => {
            setTimeout(() => {
              replyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 350);
          }}
        />
      )}

      <CommentDialog
        isOpen={replyDialogOpen}
        onOpenChange={setReplyDialogOpen}
        onConfirmComment={async (content) => {
          if (!content.trim()) return;
          setIsSendingReply(true);
          try {
            const result = await createComment(post.id, content.trim());
            if (result && typeof result === 'object' && 'serverError' in result) {
              throw new Error(result.serverError as string);
            }
            toast({ title: 'Reply sent', description: 'Your comment has been posted.' });
            await loadComments();
            setShowComments(true);
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : 'An unexpected error occurred';
            toast({ title: 'Error', description: message, variant: 'destructive' });
          } finally {
            setIsSendingReply(false);
          }
        }}
        postTitle={post.title || undefined}
      />
    </Card>
  );
};


export default function MoodStreamPage() {
  const router = useRouter();
  const params = useParams();
  const moodSlugFromUrl = params.moodSlug as string;

  const [allPosts, setAllPosts] = useState<MoodStreamPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [selectedMoodSlugs, setSelectedMoodSlugs] = useState<string[]>(moodSlugFromUrl ? [moodSlugFromUrl] : []);

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        const result = await getMoodStreamPosts();
        setAllPosts(result.items);
        setHasMorePosts(result.nextCursor !== null);
        setPostsCursor(result.nextCursor);
        setIsLoading(false);
    };
    fetchData();
  }, []);

  const loadMorePosts = useCallback(async () => {
    if (!hasMorePosts || isLoadingMore || !postsCursor) return;
    setIsLoadingMore(true);
    try {
      const result = await getMoodStreamPosts({ cursor: postsCursor });
      setAllPosts(prev => [...prev, ...result.items]);
      setHasMorePosts(result.nextCursor !== null);
      setPostsCursor(result.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMorePosts, isLoadingMore, postsCursor]);

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
          <LoadMoreButton
            onClick={loadMorePosts}
            isLoading={isLoadingMore}
            hasMore={hasMorePosts}
            loadedCount={allPosts.length}
          />
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
