
"use client";

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Users, MessageSquareText, Smile, SquareArrowUp, Edit3, Settings, Rss, CalendarDays, MapPin, ShieldAlert, UserCog, MoreVertical, Flag, Eye, ChevronDown, Inbox, Trash2, ListChecks, UsersRound, FileWarning, RefreshCcw, Link2, BarChart2, UserPlus, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";
import { useUser } from '@/hooks/use-user';

import { getTribeById } from '@/lib/data-access/tribes';
import { getTribeMembers } from '@/lib/services/tribe-service';
import { getEventsForTribe } from '@/lib/services/event-service';
import { getPostsForTribe, reportPost, promotePostToMoods, repost, createTribePost } from '@/lib/services/post-service';
import { getActiveReportedPostIds, getActiveReportsForTribe } from '@/lib/services/moderation-service';
import { MOCK_CURRENT_USER_ID, moodStreamPostIds } from '@/lib/data';

import { moodsData } from '../../moods/page';
import type { Event, TribePost, ReportedPost, Tribe, TribeMember, MoodStreamPost } from '@/lib/types';
import { PromotePostDialog } from '@/components/dialogs/boost-post-dialog';
import { ReportPostDialog } from '@/components/dialogs/report-post-dialog';
import { RepostDialog } from '@/components/dialogs/repost-dialog';
import { CreatePostDialog, type PostFormValues } from '@/components/dialogs/create-post-dialog';


const TribePostCard: React.FC<{ post: TribePost; isPromoted: boolean; isMember: boolean; isTribeAdmin: boolean; isReported: boolean; isCurrentUserAuthor: boolean; onPromoteClick: (post: TribePost) => void; onReportClick: (post: TribePost) => void; onRepostClick: (post: TribePost) => void; }> = ({ post, isPromoted, isMember, isTribeAdmin, isReported, isCurrentUserAuthor, onPromoteClick, onReportClick, onRepostClick }) => {
  const [displayTime, setDisplayTime] = useState<string>(' ');

  useEffect(() => {
    const timeSince = (date: Date): string => {
      const now = new Date();
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      if (seconds < 5) return "just now";
      if (seconds < 60) return `${Math.floor(seconds)}s ago`;
      let interval = Math.floor(seconds / 60);
      if (interval < 60) return `${interval}m ago`;
      interval = Math.floor(seconds / 3600);
      if (interval < 24) return `${interval}h ago`;
      interval = Math.floor(seconds / 86400);
      return `${interval}d ago`;
    };
    setDisplayTime(timeSince(post.timestamp));
  }, [post.timestamp]);


  return (
    <Card className={cn(
        "overflow-hidden shadow-lg relative",
        isPromoted && "bg-accent/5 hover:bg-accent/10 border-accent/30",
        isReported && !post.isRemoved && "border-destructive/50 ring-2 ring-destructive/30",
      )}>
      {post.isRemoved && (
        <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center z-10 p-4 space-y-2">
            <Badge variant="destructive" className="text-md p-2 px-3">POST REMOVED</Badge>
            {isCurrentUserAuthor && post.canBeReposted !== false && (
                <Button
                    variant="secondary" 
                    size="sm"
                    onClick={() => onRepostClick(post)}
                    className="pointer-events-auto mt-2"
                >
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
            <Avatar className="h-10 w-10 border">
              {post.authorAvatar && <AvatarImage src={post.authorAvatar} alt={post.authorName} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
              <AvatarFallback>{post.authorAvatarFallback}</AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-md font-semibold tracking-normal">{post.authorName}</CardTitle>
              <div className="flex items-center space-x-2">
                  <CardDescription className="text-xs">{displayTime}</CardDescription>
                  {isMember && isPromoted && !post.isRemoved && (
                      <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center text-xs text-accent">
                              <Rss className="h-3.5 w-3.5" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Promoted to Mood Stream</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                  )}
                  {isReported && !post.isRemoved && (
                    <TooltipProvider delayDuration={100}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center text-xs text-destructive">
                              <Flag className="h-3.5 w-3.5" />
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>This post has been reported and is under review.</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                  )}
              </div>
            </div>
            {(isMember || isCurrentUserAuthor) && !post.isRemoved && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {isTribeAdmin && (
                    <>
                      <DropdownMenuItem onClick={() => onPromoteClick(post)} disabled={isPromoted}>
                        <Rss className="mr-2 h-4 w-4" /> {isPromoted ? "Already Promoted" : "Promote to Mood Stream"}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  {!isCurrentUserAuthor && (
                      <DropdownMenuItem onClick={() => onReportClick(post)}>
                      <Flag className="mr-2 h-4 w-4" /> Report Post
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
              <Image
                src={post.imageUrl}
                alt={post.imageAlt || "Post image"}
                fill
                style={{ objectFit: 'cover' }}
                data-ai-hint={post.dataAiHintImage || "post image"}
              />
            </div>
          )}
          <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{post.content}</p>
        </CardContent>
        <CardFooter className="p-4 pt-2 flex items-center justify-between border-t bg-muted/30">
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" disabled={post.isRemoved}>
            <Smile className="mr-1.5 h-4 w-4" /> {post.vibes || 0}
          </Button>
          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" disabled={post.isRemoved}>
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

const EventHighlightCard: React.FC<{ event: Event }> = ({ event }) => {
  return (
    <Card className="overflow-hidden shadow-lg border-primary/50 hover:shadow-xl transition-shadow bg-primary/5">
      <CardHeader className="p-3">
        <Badge variant="secondary" className="w-fit mb-1 bg-primary/80 text-primary-foreground text-xs">
          UPCOMING EVENT
        </Badge>
        <CardTitle className="text-lg font-semibold tracking-tight text-primary">
          {event.name}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 text-sm">
        {event.coverImage && (
          <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-lg border">
            <Image
              src={event.coverImage}
              alt={event.name}
              fill
              style={{ objectFit: 'cover' }}
              data-ai-hint={event.dataAiHintCover || "event thumbnail"}
            />
          </div>
        )}
        <div className="flex items-center text-muted-foreground mb-1">
          <CalendarDays className="h-4 w-4 mr-2 text-primary" />
          <span>{format(event.eventDate, "MMM dd, yyyy 'at' p")}</span>
        </div>
        <div className="flex items-center text-muted-foreground mb-2">
          <MapPin className="h-4 w-4 mr-2 text-primary" />
          <span>{event.locationName}{event.locationCityRegion && event.locationCityRegion.toLowerCase() !== "online" ? `, ${event.locationCityRegion}` : ''}</span>
        </div>
        <p className="text-muted-foreground line-clamp-2">
          {event.description}
        </p>
      </CardContent>
      <CardFooter className="p-3 border-t bg-primary/10">
        <Link href={`/events/${event.id}`} passHref className="w-full">
          <Button variant="default" size="sm" className="w-full bg-primary hover:bg-primary/90">
            View Event
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
};

type FeedItem =
  | { id: string; type: 'event'; timestamp: Date; isPinned: true; data: Event }
  | { id: string; type: 'post'; timestamp: Date; isPinned: boolean; data: TribePost; isPromoted: boolean; isReported: boolean; isCurrentUserAuthor: boolean; };


export default function TribeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const { toast } = useToast();
  const { role } = useUser();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [tribeEvents, setTribeEvents] = useState<Event[]>([]);
  const [postsInTribe, setPostsInTribe] = useState<TribePost[]>([]);
  const [activeReportedPostIds, setActiveReportedPostIds] = useState<Set<string>>(new Set());
  const [currentTribeReportedPostsForDashboard, setCurrentTribeReportedPostsForDashboard] = useState<ReportedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [postToPromote, setPostToPromote] = useState<TribePost | null>(null);
  const [locallyPromotedPostIds, setLocallyPromotedPostIds] = useState<Set<string>>(new Set());

  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [postToReport, setPostToReport] = useState<TribePost | null>(null);
  const [reportReason, setReportReason] = useState("");

  const [isRepostDialogOpen, setIsRepostDialogOpen] = useState(false);
  const [postBeingReposted, setPostBeingReposted] = useState<TribePost | null>(null);
  
  const [isCreatePostDialogOpen, setIsCreatePostDialogOpen] = useState(false);

  const [currentTribeMembers, setCurrentTribeMembers] = useState<TribeMember[]>([]);

  const [isMember, setIsMember] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const baseTribeMemberships = ['1', '3', '6', '7'];

  const isTribeAdmin = useMemo(() => role === 'Admin' || role === 'Creator', [role]);
  
  const syncAllData = useCallback(async () => {
    if (!tribeId) return;
    
    setIsLoading(true);

    const createdTribeIds: string[] = JSON.parse(localStorage.getItem('myCreatedTribeIds') || '[]');
    const myTribeIds = [...new Set([...baseTribeMemberships, ...createdTribeIds])];
    setIsMember(myTribeIds.includes(tribeId));

    const [
        tribeData, 
        membersData, 
        postsData, 
        reportedIds,
        tribeReports,
    ] = await Promise.all([
      getTribeById(tribeId),
      getTribeMembers(tribeId),
      getPostsForTribe(tribeId),
      getActiveReportedPostIds(),
      getActiveReportsForTribe(tribeId),
    ]);
    
    if (tribeData) {
      setTribe(tribeData);
      setCurrentTribeMembers(membersData);
      setPostsInTribe(postsData.sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime()));
      setActiveReportedPostIds(reportedIds);
      setCurrentTribeReportedPostsForDashboard(tribeReports.reports);
      
      const eventsData = await getEventsForTribe(tribeData.name);
      setTribeEvents(eventsData.sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime()));

    } else {
      router.push('/tribes');
    }

    setIsLoading(false);
  }, [tribeId, router]);

  useEffect(() => {
    syncAllData();
  }, [tribeId, syncAllData]);

  useEffect(() => {
    window.addEventListener('focus', syncAllData);
    return () => {
        window.removeEventListener('focus', syncAllData);
    };
  }, [syncAllData]);
  
  const handleJoinTribe = () => {
    if (!tribe) return;
    setIsJoining(true);

    setTimeout(() => {
        if (tribe.joinMechanism === 'approval') {
            toast({ title: "Request Sent", description: `Your request to join ${tribe.name} is pending approval.` });
        } else {
            const currentMyTribeIds = JSON.parse(localStorage.getItem('myCreatedTribeIds') || '[]');
            currentMyTribeIds.push(tribe.id);
            localStorage.setItem('myCreatedTribeIds', JSON.stringify([...new Set(currentMyTribeIds)]));
            syncAllData(); 
            toast({ title: "Welcome!", description: `You have successfully joined ${tribe.name}.` });
        }
        setIsJoining(false);
    }, 1000);
  };

  const combinedFeedItems = useMemo(() => {
    if (!tribe) return [];

    const eventItems = (isMember ? tribeEvents : [])
      .map(event => ({
        id: `event-${event.id}`,
        type: 'event' as const,
        timestamp: event.eventDate,
        isPinned: true,
        data: event,
      }));

    const postItems = (isMember ? postsInTribe : postsInTribe.filter(p => moodStreamPostIds.has(p.id) || locallyPromotedPostIds.has(p.id)))
      .map(post => ({
        id: `post-${post.id}`,
        type: 'post' as const,
        timestamp: post.timestamp,
        isPinned: false,
        data: post,
        isPromoted: moodStreamPostIds.has(post.id) || locallyPromotedPostIds.has(post.id),
        isReported: activeReportedPostIds.has(post.id) && !post.isRemoved,
        isCurrentUserAuthor: post.authorId === MOCK_CURRENT_USER_ID,
      }));

    const allItems: FeedItem[] = [...eventItems, ...postItems];

    allItems.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return allItems;
  }, [tribe, tribeEvents, postsInTribe, isMember, locallyPromotedPostIds, activeReportedPostIds]);


  const handleOpenPromoteDialog = (post: TribePost) => {
    if (moodStreamPostIds.has(post.id) || locallyPromotedPostIds.has(post.id)) {
      toast({
        title: "Already Promoted",
        description: `"${post.title || 'This post'}" is already in a mood stream.`,
      });
      return;
    }
    setPostToPromote(post);
    setIsPromoteDialogOpen(true);
  };

  const handleConfirmPromotion = async (postId: string, selectedMoodSlugs: string[]) => {
    if (!postToPromote) return;
    await promotePostToMoods(postId, selectedMoodSlugs);
    setLocallyPromotedPostIds(prev => new Set(prev).add(postId)); // For optimistic UI update
    toast({
      title: "Post Promoted",
      description: `Post "${postToPromote.title || postId}" has been promoted to ${selectedMoodSlugs.length} mood stream(s).`,
    });
    setPostToPromote(null);
    setIsPromoteDialogOpen(false);
  };

  const handleOpenReportDialog = (post: TribePost) => {
    const alreadyReported = activeReportedPostIds.has(post.id);
    if(alreadyReported && !post.isRemoved){
         toast({
            title: "Already Reported",
            description: `You or someone else has already reported "${post.title || 'this post'}". An admin will review it.`,
        });
        return;
    }
    setPostToReport(post);
    setReportReason("");
    setIsReportDialogOpen(true);
  };

  const handleConfirmReport = async () => {
    if (!postToReport) return;
    await reportPost({
      postId: postToReport.id,
      postTitle: postToReport.title,
      reporterName: "You (Current User)",
      reason: reportReason.trim() || "No reason provided.",
    });
    await syncAllData(); // Refresh data to show reported status
    toast({
      title: "Post Reported",
      description: `Thank you for reporting "${postToReport.title || 'this post'}". An admin will review it.`,
    });
    setIsReportDialogOpen(false);
    setPostToReport(null);
    setReportReason("");
  };

  const handleOpenRepostDialog = (post: TribePost) => {
    setPostBeingReposted(post);
    setIsRepostDialogOpen(true);
  };

  const handleConfirmRepost = async (editedContent: string, originalPostTitle?: string) => {
    if (!postBeingReposted || !tribe) return;
    await repost(postBeingReposted, editedContent);
    syncAllData();
    toast({
      title: "Post Reposted",
      description: `Your post has been successfully reposted to ${tribe.name}.`,
    });
    setIsRepostDialogOpen(false);
    setPostBeingReposted(null);
  };

  const handlePostCreated = async (newPostData: PostFormValues) => {
    if (!tribe) return;
    await createTribePost(tribe.id, newPostData);
    syncAllData();
    toast({
        title: "Post Created!",
        description: "Your post has been added to the tribe feed.",
    });
    setIsCreatePostDialogOpen(false);
  };

  if (isLoading || !tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const tribeMoodObjects = tribe.moods?.map(slug => moodsData.find(m => m.slug === slug)).filter(Boolean) || [];


  return (
    <div className="space-y-6 pb-12">
      {isTribeAdmin && (
        <Card className="shadow-xl border-primary/30">
            <CardHeader className="p-4">
                <div className="flex items-center space-x-3">
                    <ShieldAlert className="h-7 w-7 text-primary" />
                    <div>
                        <CardTitle className="text-xl font-semibold tracking-normal text-primary">Tribe Admin Dashboard</CardTitle>
                        <CardDescription className="text-sm">
                            Quick stats and admin tools for <span className="font-medium">{tribe.name}</span>.
                        </CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="p-4 pt-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Card className="bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground font-medium">TOTAL MEMBERS</p>
                        <p className="text-2xl font-bold text-foreground">{currentTribeMembers.length}</p>
                    </Card>
                    <Card className="bg-muted/50 p-3">
                        <p className="text-xs text-muted-foreground font-medium">PENDING REPORTS</p>
                        <p className="text-2xl font-bold text-destructive">{currentTribeReportedPostsForDashboard.length}</p>
                    </Card>
                </div>
                 <Separator />
                <div className="flex flex-col sm:flex-row gap-3">
                    <Link href={`/tribes/${tribeId}/manage-members`} passHref className="flex-1">
                        <Button variant="outline" className="w-full">
                            <UsersRound className="mr-2 h-4 w-4"/> Manage Members
                        </Button>
                    </Link>
                    <Link href={`/tribes/${tribeId}/mod-queue`} passHref className="flex-1">
                        <Button variant="outline" className="w-full">
                            <ListChecks className="mr-2 h-4 w-4"/> Moderation Queue
                        </Button>
                    </Link>
                     <Link href={`/tribes/${tribeId}/analytics`} passHref className="flex-1">
                        <Button variant="outline" className="w-full">
                            <BarChart2 className="mr-2 h-4 w-4"/> Engagement Analytics
                        </Button>
                    </Link>
                     <Link href={`/tribes/${tribeId}/settings`} passHref className="flex-1">
                        <Button variant="outline" className="w-full">
                            <Settings className="mr-2 h-4 w-4"/> Tribe Settings
                        </Button>
                    </Link>
                </div>
            </CardContent>
        </Card>
      )}


      <Card className="overflow-hidden shadow-xl relative">
        <div className="absolute top-4 left-4 z-10">
          <Button variant="outline" size="icon" onClick={() => router.back()} className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        {isTribeAdmin && (
            <div className="absolute top-4 right-4 z-10">
              <Link href={`/tribes/${tribeId}/settings`} passHref>
                <Button variant="outline" size="icon" className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
                    <Settings className="h-5 w-5" />
                </Button>
              </Link>
            </div>
        )}
        <div className="relative h-48 md:h-64 w-full">
          <Image
            src={tribe.cover}
            alt={`${tribe.name} cover image`}
            fill
            style={{objectFit:"cover"}}
            data-ai-hint={tribe.dataAiHint || "community group"}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        </div>
        <CardHeader className="relative -mt-16 z-10 p-4 md:p-6 bg-transparent">
          <CardTitle className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight drop-shadow-lg">{tribe.name}</CardTitle>
          <div className="flex items-center space-x-3 pt-1">
            <Badge variant={tribe.isPublic ? "secondary" : "destructive"} className="text-xs py-1 px-2 backdrop-blur-sm bg-black/30 text-white border-white/50">
              {tribe.isPublic ? "Public Tribe" : "Private Tribe"}
            </Badge>
            <div className="flex items-center text-sm text-white drop-shadow-md">
              <Users className="h-4 w-4 mr-1.5" /> {tribe.members} members
            </div>
            {tribe.homepageUrl && (
                <a href={tribe.homepageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-white hover:text-primary-foreground hover:underline drop-shadow-md transition-colors">
                    <Link2 className="h-4 w-4 mr-1.5" />
                    Website
                </a>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-4 md:p-6 pt-2">
          <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{tribe.description}</p>
          {tribeMoodObjects.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {tribeMoodObjects.map(mood => mood && (
                <Badge key={mood.slug} variant="outline" className={`border-current ${mood.textClass} ${mood.bgClass}/30`}>
                  {mood.emoji} {mood.name}
                </Badge>
              ))}
            </div>
          )}
           {!isMember && tribe.isPublic && (
            <div className="mt-4 pt-4 border-t">
              <Button onClick={handleJoinTribe} disabled={isJoining}>
                <UserPlus className="mr-2 h-4 w-4" />
                {isJoining ? 'Joining...' : 'Join Tribe'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                {tribe.joinMechanism === 'approval' ? 'Your request will be sent to the tribe admins for approval.' : 'You can join this tribe immediately.'}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {isMember && (
        <Card className="shadow-lg">
            <CardHeader className="p-4 flex-row items-center space-x-3">
                <Avatar>
                    <AvatarImage src="https://placehold.co/40x40.png" alt="User" data-ai-hint="current user avatar"/>
                    <AvatarFallback>ME</AvatarFallback>
                </Avatar>
                <Button variant="outline" className="flex-1 justify-start text-muted-foreground" onClick={() => setIsCreatePostDialogOpen(true)}>
                    What's on your mind, User?
                </Button>
            </CardHeader>
            <CardFooter className="p-4 pt-0 flex justify-end">
                <Button className="bg-primary hover:bg-primary/90" onClick={() => setIsCreatePostDialogOpen(true)}>
                    <Edit3 className="mr-2 h-4 w-4" /> Create Post
                </Button>
            </CardFooter>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground tracking-normal px-1">
            {isMember ? "Feed" : "Featured Posts in Mood Streams"}
        </h2>
        {combinedFeedItems.length > 0 ? (
          combinedFeedItems.map(item => {
            if (item.type === 'event') {
              return <EventHighlightCard key={item.id} event={item.data as Event} />;
            }
            const post = item.data as TribePost;
            const postKey = `post-${post.id}-${post.isRemoved}-${post.canBeReposted}-${item.isReported}`;
            return (
              <div key={postKey} id={`post-${post.id}`}>
                <TribePostCard
                  post={post}
                  isPromoted={item.isPromoted}
                  isMember={isMember}
                  isTribeAdmin={isTribeAdmin}
                  isReported={item.isReported}
                  isCurrentUserAuthor={item.isCurrentUserAuthor}
                  onPromoteClick={handleOpenPromoteDialog}
                  onReportClick={handleOpenReportDialog}
                  onRepostClick={handleOpenRepostDialog}
                />
              </div>
            );
          })
        ) : (
          <Card className="text-center py-12 shadow-md">
            <CardContent className="flex flex-col items-center justify-center">
              <MessageSquareText className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-1">
                {isMember ? `No Posts Yet in ${tribe.name}` : `No Featured Posts from ${tribe.name} in Mood Streams`}
              </h3>
              <p className="text-muted-foreground">
                {isMember ? `Be the first to share something!` : "Check back later for promoted content from this tribe."}
              </p>
            </CardContent>
          </Card>
        )}
      </section>
      {postToPromote && tribe && (
        <PromotePostDialog
          isOpen={isPromoteDialogOpen}
          onOpenChange={setIsPromoteDialogOpen}
          post={postToPromote}
          onConfirmPromotion={handleConfirmPromotion}
          tribeMoodSlugs={tribe.moods || []}
        />
      )}
       {postToReport && (
        <ReportPostDialog
          isOpen={isReportDialogOpen}
          onOpenChange={setIsReportDialogOpen}
          post={postToReport}
          reportReason={reportReason}
          setReportReason={setReportReason}
          onConfirmReport={handleConfirmReport}
        />
      )}
      {postBeingReposted && tribe && (
        <RepostDialog
          isOpen={isRepostDialogOpen}
          onOpenChange={setIsRepostDialogOpen}
          postToRepost={postBeingReposted}
          onConfirmRepost={handleConfirmRepost}
        />
      )}
      {tribe && (
        <CreatePostDialog
            isOpen={isCreatePostDialogOpen}
            onOpenChange={setIsCreatePostDialogOpen}
            onPostCreated={handlePostCreated}
            tribeName={tribe.name}
        />
      )}
    </div>
  );
}
