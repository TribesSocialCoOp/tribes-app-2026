
"use client";

import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { format } from 'date-fns';

// ShadCN UI Imports
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";

// Lucide Icons
import { ArrowLeft, BookOpen, Globe, Map, Building, History, Link2, MessageSquare, PlusCircle, Rss, Share2, Smile, Send, MessageSquarePlus, MoreVertical, Flag, Loader2 } from "lucide-react";

// Data & Services
import { ReportCommentDialog } from '@/components/dialogs/report-comment-dialog';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import type { DiscussionComment, UserRole } from '@/lib/types';
import type { StoryTopic, SourceArticle } from '@/lib/types';
import { getStoryTopicById, getArticlesForStory, getCommentsForStory, reportComment, createStoryComment } from '@/lib/actions/content-actions';

// Helper for Article Card
const ArticleCard: React.FC<{ article: SourceArticle }> = ({ article }) => (
 <Card className="shadow-sm hover:shadow-md transition-shadow flex items-stretch overflow-hidden rounded-lg">
    <div className="w-32 flex-shrink-0 relative bg-gradient-to-br from-muted to-muted-foreground/20 flex items-center justify-center">
      <span className="text-2xl font-bold text-muted-foreground/40">
        {article.dataAiHint ? article.dataAiHint.substring(0, 2).toUpperCase() : '📰'}
      </span>
    </div>
    <div className="flex-1 min-w-0 p-3 flex flex-col justify-between">
      <div>
        <CardHeader className="p-0 pb-1">
          <a href={article.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
            <CardTitle className="text-base font-semibold tracking-tight line-clamp-2">{article.title}</CardTitle>
          </a>
          <CardDescription className="text-xs mt-0.5">
            From: {article.sourceName} - Published: {format(article.publishedDate, "MMM d, yyyy")}
          </CardDescription>
        </CardHeader>
        {article.summarySnippet && (
          <CardContent className="p-0 pt-1">
            <p className="text-xs text-muted-foreground line-clamp-2">{article.summarySnippet}</p>
          </CardContent>
        )}
      </div>
      <CardFooter className="p-0 pt-2">
        <Button variant="link" size="sm" asChild className="text-xs p-0 h-auto">
          <a href={article.url} target="_blank" rel="noopener noreferrer">
            Read Full Article <Link2 className="ml-1 h-3 w-3"/>
          </a>
        </Button>
      </CardFooter>
    </div>
  </Card>
);


// Helper for Comment Card
interface CommentCardProps {
  comment: DiscussionComment;
  storyId: string;
  level?: number;
  onReportComment: (comment: DiscussionComment) => void;
}
const StoryCommentCard: React.FC<CommentCardProps> = ({ comment, storyId, level = 0, onReportComment }) => {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState("");
  const [isReplying, setIsReplying] = useState(false);
  const { role } = useUser();
  const { toast } = useToast();
  const isUserLoggedIn = !!role;

  const handlePostReply = async () => {
    if (!replyContent.trim() || isReplying) return;
    setIsReplying(true);
    try {
      await createStoryComment(storyId, replyContent.trim(), comment.id);
      setReplyContent("");
      setShowReplyInput(false);
      toast({ title: "Reply Posted", description: `Your reply to ${comment.authorName} has been posted.` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post reply';
      toast({ variant: 'destructive', title: 'Error', description: msg });
    } finally {
      setIsReplying(false);
    }
  };

  return (
    <Card className={`shadow-sm ${level > 0 ? 'ml-4 sm:ml-6' : ''} bg-background`}>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start space-x-2">
          {!comment.authorIsAlias ? (
            <Link href={`/profile/${comment.authorId}`}>
              <Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all">
                {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} data-ai-hint={comment.dataAiHintAvatar || "avatar"} />}
                <AvatarFallback className="text-xs">{comment.authorAvatarFallback}</AvatarFallback>
              </Avatar>
            </Link>
          ) : (
            <Avatar className="h-8 w-8">
              {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} data-ai-hint={comment.dataAiHintAvatar || "avatar"} />}
              <AvatarFallback className="text-xs">{comment.authorAvatarFallback}</AvatarFallback>
            </Avatar>
          )}
          <div className="flex-1">
            {!comment.authorIsAlias ? (
              <Link href={`/profile/${comment.authorId}`} className="hover:underline decoration-primary/30 underline-offset-2">
                <p className="text-xs font-semibold">{comment.authorName}</p>
              </Link>
            ) : (
              <p className="text-xs font-semibold">{comment.authorName}</p>
            )}
            <p className="text-xs text-muted-foreground">{format(comment.timestamp, "MMM d, yyyy 'at' h:mm a")}</p>
          </div>
          {isUserLoggedIn && (
            <ResponsiveMenu>
              <ResponsiveMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </ResponsiveMenuTrigger>
              <ResponsiveMenuContent align="end">
                <ResponsiveMenuItem onClick={() => onReportComment(comment)}>
                  <Flag className="mr-2 h-4 w-4" /> Report Comment
                </ResponsiveMenuItem>
                {/* Future actions like Edit/Delete for comment author can be added here */}
              </ResponsiveMenuContent>
            </ResponsiveMenu>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="text-sm whitespace-pre-line">{comment.content}</p>
      </CardContent>
      {isUserLoggedIn && (
        <CardFooter className="p-3 pt-1 flex items-center justify-start space-x-3">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary">
              <Smile className="mr-1 h-3.5 w-3.5"/> {comment.vibes || 0}
          </Button>
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary" onClick={() => setShowReplyInput(!showReplyInput)}>
              <MessageSquare className="mr-1 h-3.5 w-3.5"/> Reply
          </Button>
        </CardFooter>
      )}
      {showReplyInput && (
        <div className="p-3 border-t">
            <Textarea
                placeholder={`Replying to ${comment.authorName}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[60px] text-sm"
            />
            <div className="mt-2 flex justify-end">
                <Button size="sm" disabled={!replyContent.trim() || isReplying} onClick={handlePostReply}>
                    {isReplying ? 'Posting...' : 'Post Reply'} <Send className="ml-1.5 h-3.5 w-3.5"/>
                </Button>
            </div>
        </div>
      )}
      {comment.replies && comment.replies.length > 0 && (
        <div className="p-3 border-t space-y-2 bg-muted/30">
          {comment.replies.map(reply => <StoryCommentCard key={reply.id} comment={reply} storyId={storyId} level={level + 1} onReportComment={onReportComment} />)}
        </div>
      )}
    </Card>
  );
};


export default function StoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const storyId = params.storyId as string;
  const { toast } = useToast();
  const { role, user } = useUser();

  const [story, setStory] = useState<StoryTopic | null>(null);
  const [articles, setArticles] = useState<SourceArticle[]>([]);
  const [comments, setComments] = useState<DiscussionComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState<string>("articles");
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);

  const [isReportCommentDialogOpen, setIsReportCommentDialogOpen] = useState(false);
  const [commentToReport, setCommentToReport] = useState<DiscussionComment | null>(null);
  const [reportCommentReason, setReportCommentReason] = useState("");
  
  const isCreatorOrAdmin = role === 'Creator' || role === 'Admin';
  const isLoggedIn = !!role;


  useEffect(() => {
    if (storyId) {
      const fetchData = async () => {
        setIsLoading(true);
        const [foundStory, foundArticles, foundComments] = await Promise.all([
          getStoryTopicById(storyId),
          getArticlesForStory(storyId),
          getCommentsForStory(storyId),
        ]);
        setStory(foundStory || null);
        setArticles(foundArticles);
        setComments(foundComments);
        setIsLoading(false);
      };
      fetchData();
    }
  }, [storyId]);

  const categoryIcon = useMemo(() => {
    if (!story) return <BookOpen className="h-5 w-5" />;
    const iconClass = story.coverImage ? 'text-white h-4 w-4' : 'h-4 w-4';
    switch (story.category) {
      case 'local': return <Map className={iconClass} />;
      case 'national': return <Building className={iconClass} />;
      case 'global': return <Globe className={iconClass} />;
      default: return <BookOpen className={iconClass} />;
    }
  }, [story]);

  const handlePostComment = async () => {
    if (!newComment.trim() || !story) return;
    // Optimistic update
    const newCommentObj: DiscussionComment = {
        id: `new-com-${Date.now()}`,
        authorId: user?.id || 'anon',
        authorName: user?.name || "You",
        authorAvatarFallback: user?.name?.substring(0, 2).toUpperCase() || "??",
        content: newComment,
        timestamp: new Date(),
        vibes: 0,
    };
    setComments(prev => [newCommentObj, ...prev]);
    const commentText = newComment;
    setNewComment("");
    // Persist to DB
    try {
      // createStoryComment imported at top of file
      await createStoryComment(story.id, commentText);
    } catch (err: unknown) {
      toast({ variant: 'destructive', title: 'Error', description: ((err instanceof Error) ? err.message : 'An error occurred') });
    }
  };

  const handleAddCommentClick = () => {
    setActiveTab("discussions");
    setTimeout(() => {
      commentTextareaRef.current?.focus();
    }, 50); // Small delay to ensure tab content is rendered
  };

  const handleOpenReportCommentDialog = (comment: DiscussionComment) => {
    setCommentToReport(comment);
    setReportCommentReason(""); // Reset reason
    setIsReportCommentDialogOpen(true);
  };

  const handleConfirmReportComment = async () => {
    if (!commentToReport) return;
    
    await reportComment({
      commentId: commentToReport.id,
      commentAuthor: commentToReport.authorName,
      reason: reportCommentReason,
    });
    
    toast({
        title: "Comment Reported",
        description: `Thank you for reporting the comment by ${commentToReport.authorName}. An admin will review it.`,
    });
    setIsReportCommentDialogOpen(false);
    setCommentToReport(null);
    setReportCommentReason("");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (!story) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <History className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Story Not Found</h1>
        <p className="text-muted-foreground mb-6">The story topic you are looking for does not exist or may have been moved.</p>
        <Button onClick={() => router.push('/our-story')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Our Story
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mt-2">
        <Button variant="outline" size="sm" onClick={() => router.push('/our-story')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Our Story
        </Button>
      </div>

      <Card className="shadow-xl">
        {story.coverImage && (
          <div className="relative h-56 md:h-72 w-full rounded-t-lg overflow-hidden">
            <Image
              src={story.coverImage}
              alt={`${story.title} cover image`}
              fill
              style={{objectFit:"cover"}}
              data-ai-hint={story.dataAiHintCover || "topic banner"}
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 z-10 p-4 md:p-6">
              <div className="flex items-center space-x-2 mb-2">
                <Badge variant="outline" className="text-white border-white/70 bg-black/30 backdrop-blur-sm capitalize py-1 px-2 text-xs">
                  {categoryIcon}
                  <span className="ml-1.5">{story.category}</span>
                </Badge>
              </div>
              <h1 className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-white drop-shadow-lg">
                {story.title}
              </h1>
              {story.curator && (
                <div className="flex items-center space-x-2 pt-1 text-white/90 drop-shadow-sm">
                  <Avatar className="h-7 w-7">
                    {story.curatorAvatar && <AvatarImage src={story.curatorAvatar} alt={story.curator} data-ai-hint={story.dataAiHintCuratorAvatar || "avatar person"} />}
                    <AvatarFallback className="text-xs">{story.curatorAvatarFallback || story.curator.substring(0,1)}</AvatarFallback>
                  </Avatar>
                  <p className="text-xs">
                    Curated by <span className="font-medium">{story.curator}</span> &bull; Updated: {format(story.lastUpdatedAt, "MMM d, yyyy")}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
        {!story.coverImage && (
          <CardHeader className="p-4 md:p-6">
            <div className="flex items-center space-x-2 mb-1">
              <Badge variant="outline" className="capitalize py-1 px-2 text-xs">
                {categoryIcon}
                <span className="ml-1.5">{story.category}</span>
              </Badge>
            </div>
            <CardTitle className="text-2xl md:text-3xl font-bold font-mono tracking-tight text-foreground">
              {story.title}
            </CardTitle>
            {story.curator && (
              <div className="flex items-center space-x-2 pt-1 text-muted-foreground">
                <Avatar className="h-7 w-7">
                  {story.curatorAvatar && <AvatarImage src={story.curatorAvatar} alt={story.curator} data-ai-hint={story.dataAiHintCuratorAvatar || "avatar person"} />}
                  <AvatarFallback className="text-xs">{story.curatorAvatarFallback || story.curator.substring(0,1)}</AvatarFallback>
                </Avatar>
                <p className="text-xs">
                  Curated by <span className="font-medium">{story.curator}</span> &bull; Updated: {format(story.lastUpdatedAt, "MMM d, yyyy")}
                </p>
              </div>
            )}
          </CardHeader>
        )}
        <CardContent className="p-4 md:p-6">
          <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{story.summary}</p>
           <div className="mt-4 flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={!isLoggedIn}><Rss className="mr-1.5 h-4 w-4"/>Follow Topic</Button>
                <Button variant="outline" size="sm"><Share2 className="mr-1.5 h-4 w-4"/>Share</Button>
                {isCreatorOrAdmin && (
                  <Button variant="outline" size="sm"><PlusCircle className="mr-1.5 h-4 w-4"/>Add Source</Button>
                )}
                {isLoggedIn && (
                  <Button variant="default" size="sm" onClick={handleAddCommentClick} className="bg-accent text-accent-foreground hover:bg-accent/90">
                      <MessageSquarePlus className="mr-1.5 h-4 w-4"/>Add Comment
                  </Button>
                )}
            </div>
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="articles">Sources & Articles ({articles.length})</TabsTrigger>
          <TabsTrigger value="discussions">Discussions ({comments.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="articles" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Related Articles & Sources</CardTitle>
              <CardDescription>Key pieces of information and context for this topic.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {articles.length > 0 ? (
                articles.map(article => <ArticleCard key={article.id} article={article} />)
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No articles or sources have been added to this topic yet.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="discussions" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Community Discussion</CardTitle>
              <CardDescription>Share your thoughts and engage with others on this topic.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoggedIn && (
                <>
                  <div className="space-y-3">
                      <Label htmlFor="new-comment">Add your comment:</Label>
                      <Textarea
                          id="new-comment"
                          ref={commentTextareaRef}
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          placeholder="What are your thoughts?"
                          className="min-h-[80px]"
                      />
                      <div className="flex justify-end">
                          <Button onClick={handlePostComment} disabled={!newComment.trim()}>Post Comment</Button>
                      </div>
                  </div>
                  <Separator />
                </>
              )}
              {comments.length > 0 ? (
                comments.map(comment => <StoryCommentCard key={comment.id} comment={comment} storyId={storyId} onReportComment={handleOpenReportCommentDialog} />)
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No discussions have started on this topic yet. Be the first!</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {commentToReport && (
        <ReportCommentDialog
          isOpen={isReportCommentDialogOpen}
          onOpenChange={setIsReportCommentDialogOpen}
          comment={commentToReport}
          reportReason={reportCommentReason}
          setReportReason={setReportCommentReason}
          onConfirmReport={handleConfirmReportComment}
        />
      )}
    </div>
  );
}
