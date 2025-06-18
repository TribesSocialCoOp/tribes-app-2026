
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

// Lucide Icons
import { ArrowLeft, BookOpen, Globe, Map, Building, History, Link2, MessageSquare, PlusCircle, Rss, Share2, Filter, ThumbsUp, Send, MessageSquarePlus } from "lucide-react";

// Data (mock for now)
import { mockStoryTopics, type StoryTopic } from '../page'; // Import from the parent page

// Interfaces
interface SourceArticle {
  id: string;
  title: string;
  url: string;
  sourceName: string;
  publishedDate: Date;
  summarySnippet?: string;
  dataAiHint?: string;
}

interface DiscussionComment {
  id:string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  content: string;
  timestamp: Date;
  vibes?: number;
  replies?: DiscussionComment[];
  dataAiHintAvatar?: string;
}

const MOCK_COMMENT_DATE_MS = new Date("2025-07-15T12:00:00.000Z").getTime();

// Mock data for a specific story
const mockArticlesForStory: Record<string, SourceArticle[]> = {
  "story1": [
    { id: "art1-1", title: "City Announces New Recycling Pickup Schedule", url: "#", sourceName: "City Herald", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 0.5), summarySnippet: "The city council has officially released the updated schedule for recycling pickups, effective next month...", dataAiHint: "newspaper article" },
    { id: "art1-2", title: "Understanding Contamination in Recycling Bins", url: "#", sourceName: "EcoWatch Org", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 1), summarySnippet: "A common issue hindering recycling efforts is contamination. Learn what can and cannot be recycled.", dataAiHint: "environment infographic" },
  ],
  "story2": [
    { id: "art2-1", title: "Economists Weigh In on UBI Pilot Programs", url: "#", sourceName: "National Economics Review", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 2), summarySnippet: "Several pilot programs for Universal Basic Income have yielded interesting results, sparking further debate...", dataAiHint: "graph chart" },
  ],
  "story4": [
    { id: "art4-1", title: "Proposed Metro Expansion Routes Revealed", url: "#", sourceName: "Urban Transit Today", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 0.2), summarySnippet: "Details of the proposed metro line expansion, including new station locations and timelines, were shared today.", dataAiHint: "map transport" },
    { id: "art4-2", title: "Community Feedback Session on Bike Lane Project", url: "#", sourceName: "City Planning Dept.", publishedDate: new Date(MOCK_COMMENT_DATE_MS - 86400000 * 1.5), summarySnippet: "The city is seeking public input on the new interconnected bike lane project. Attend the session next Tuesday.", dataAiHint: "people meeting" },
  ]
};

const mockCommentsForStory: Record<string, DiscussionComment[]> = {
  "story1": [
    { id: "com1-1", authorId: "userA", authorName: "GreenThumb", authorAvatarFallback: "GT", content: "Finally, some clarity on the new schedule! Thanks for sharing.", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 2), vibes: 5, dataAiHintAvatar: "gardener person" },
    { id: "com1-2", authorId: "userB", authorName: "CityDweller", authorAvatarFallback: "CD", content: "I'm still confused about plastics #5. Are they accepted now or not?", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 1), vibes: 2, replies: [
      { id: "com1-2-1", authorId: "userA", authorName: "GreenThumb", authorAvatarFallback: "GT", content: "I think it depends on the specific item, best to check the city's website directly.", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 0.5), vibes: 1, dataAiHintAvatar: "gardener person"},
    ], dataAiHintAvatar: "urban resident" },
  ],
  "story2": [
     { id: "com2-1", authorId: "userC", authorName: "PolicyWonk", authorAvatarFallback: "PW", content: "The long-term fiscal implications of UBI are still the biggest question mark for me.", timestamp: new Date(MOCK_COMMENT_DATE_MS - 3600000 * 5), vibes: 10, dataAiHintAvatar: "researcher suit"},
  ],
};

// Helper for Article Card
const ArticleCard: React.FC<{ article: SourceArticle }> = ({ article }) => (
  <Card className="shadow-sm hover:shadow-md transition-shadow flex items-stretch overflow-hidden rounded-lg">
    <div className="w-32 flex-shrink-0 relative bg-muted">
      <Image
        src={`https://placehold.co/150x150.png?text=${encodeURIComponent(article.dataAiHint ? article.dataAiHint.substring(0,10) : 'Source')}`}
        alt={article.title}
        layout="fill"
        objectFit="cover"
        className="w-full h-full"
        data-ai-hint={article.dataAiHint || "news document"}
      />
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
const CommentCard: React.FC<{ comment: DiscussionComment, level?: number }> = ({ comment, level = 0 }) => {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyContent, setReplyContent] = useState("");

  return (
    <Card className={`shadow-sm ${level > 0 ? 'ml-4 sm:ml-6' : ''} bg-background`}>
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start space-x-2">
          <Avatar className="h-8 w-8">
            {comment.authorAvatar && <AvatarImage src={comment.authorAvatar} alt={comment.authorName} data-ai-hint={comment.dataAiHintAvatar || "avatar"} />}
            <AvatarFallback className="text-xs">{comment.authorAvatarFallback}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <p className="text-xs font-semibold">{comment.authorName}</p>
            <p className="text-xs text-muted-foreground">{format(comment.timestamp, "MMM d, yyyy 'at' h:mm a")}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0">
        <p className="text-sm whitespace-pre-line">{comment.content}</p>
      </CardContent>
      <CardFooter className="p-3 pt-1 flex items-center justify-start space-x-3">
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary">
            <ThumbsUp className="mr-1 h-3.5 w-3.5"/> {comment.vibes || 0}
        </Button>
        <Button variant="ghost" size="sm" className="text-xs text-muted-foreground hover:text-primary" onClick={() => setShowReplyInput(!showReplyInput)}>
            <MessageSquare className="mr-1 h-3.5 w-3.5"/> Reply
        </Button>
      </CardFooter>
      {showReplyInput && (
        <div className="p-3 border-t">
            <Textarea
                placeholder={`Replying to ${comment.authorName}...`}
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                className="min-h-[60px] text-sm"
            />
            <div className="mt-2 flex justify-end">
                <Button size="sm" disabled={!replyContent.trim()} onClick={() => { console.log("Simulate reply:", replyContent); setReplyContent(""); setShowReplyInput(false); }}>
                    Post Reply <Send className="ml-1.5 h-3.5 w-3.5"/>
                </Button>
            </div>
        </div>
      )}
      {comment.replies && comment.replies.length > 0 && (
        <div className="p-3 border-t space-y-2 bg-muted/30">
          {comment.replies.map(reply => <CommentCard key={reply.id} comment={reply} level={level + 1} />)}
        </div>
      )}
    </Card>
  );
};


export default function StoryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const storyId = params.storyId as string;

  const [story, setStory] = useState<StoryTopic | null>(null);
  const [articles, setArticles] = useState<SourceArticle[]>([]);
  const [comments, setComments] = useState<DiscussionComment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newComment, setNewComment] = useState("");
  const [activeTab, setActiveTab] = useState<string>("articles");
  const commentTextareaRef = useRef<HTMLTextAreaElement>(null);


  useEffect(() => {
    if (storyId) {
      setIsLoading(true);
      const foundStory = mockStoryTopics.find(s => s.id === storyId);
      setStory(foundStory || null);
      setArticles(mockArticlesForStory[storyId] || []);
      setComments(mockCommentsForStory[storyId] || []);
      setIsLoading(false);
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

  const handlePostComment = () => {
    if (!newComment.trim() || !story) return;
    const newCommentObj: DiscussionComment = {
        id: `new-com-${Date.now()}`,
        authorId: "currentUser",
        authorName: "You (Current User)",
        authorAvatarFallback: "ME",
        content: newComment,
        timestamp: new Date(),
        vibes: 0,
    };
    setComments(prev => [newCommentObj, ...prev]);
    setNewComment("");
  };

  const handleAddCommentClick = () => {
    setActiveTab("discussions");
    // Timeout to allow tab content to render before focusing
    setTimeout(() => {
      commentTextareaRef.current?.focus();
    }, 0);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading story details...</p>
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
                <Button variant="outline" size="sm"><Rss className="mr-1.5 h-4 w-4"/>Follow Topic</Button>
                <Button variant="outline" size="sm"><Share2 className="mr-1.5 h-4 w-4"/>Share</Button>
                <Button variant="outline" size="sm"><PlusCircle className="mr-1.5 h-4 w-4"/>Add Source</Button>
                <Button variant="default" size="sm" onClick={handleAddCommentClick} className="bg-accent text-accent-foreground hover:bg-accent/90">
                    <MessageSquarePlus className="mr-1.5 h-4 w-4"/>Add Comment
                </Button>
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
              {comments.length > 0 ? (
                comments.map(comment => <CommentCard key={comment.id} comment={comment} />)
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">No discussions have started on this topic yet. Be the first!</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

    
