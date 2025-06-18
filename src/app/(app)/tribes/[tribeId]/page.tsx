
"use client";

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Users, MessageSquareText, Smile, SquareArrowUp, Edit3, Settings, Rss, CalendarDays, MapPin, ShieldAlert, UserCog, MoreVertical, Flag, Eye, ChevronDown, Inbox, Trash2, ListChecks, UsersRound, FileWarning, RefreshCcw } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";

import { tribesData, type Tribe } from '../page';
import { moodsData } from '../../moods/page';
import { allMoodStreamPosts } from '../../moods/[moodSlug]/page';
import type { Event } from '../../events/[eventId]/page';
import { sampleEventsData } from '../../events/[eventId]/page';
import { PromotePostDialog } from '@/components/dialogs/boost-post-dialog';
import { ReportPostDialog } from '@/components/dialogs/report-post-dialog';
import { RepostDialog } from '@/components/dialogs/repost-dialog';

export interface TribePost {
  id: string;
  tribeId: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorAvatarFallback: string;
  timestamp: Date;
  title?: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
  vibes?: number;
  comments?: number;
  isRemoved?: boolean;
  canBeReposted?: boolean;
  removalReason?: string;
  originalPostId?: string;
}

const MOCK_CURRENT_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();
const MOCK_CURRENT_USER_ID = "authorAE"; // Alice Example is our test user

export let initialSampleTribePosts: TribePost[] = [
  {
    id: "tribe_post_ai_local1", tribeId: "1", authorId: "authorXY", authorName: "AI Ethicist", authorAvatarFallback: "AE",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 2),
    title: "Local Discussion: Ethics in AI Development",
    content: "Starting a thread specifically for our tribe members on the ethical considerations of recent AI breakthroughs. What are your immediate thoughts?",
    vibes: 30, comments: 5, dataAiHintAvatar: "researcher scientist",
    isRemoved: false, 
    canBeReposted: true,
  },
  {
    id: "msp2", tribeId: "1", authorId: MOCK_CURRENT_USER_ID, authorName: "ProductivePro (You)", authorAvatarFallback: "PP",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 3),
    title: "My Top 5 Productivity Hacks for Deep Work",
    content: "Sharing my secrets to staying in the zone! Tip #1: Time blocking is key. This was also shared to the Focus mood stream.",
    imageUrl: "https://placehold.co/600x400.png?text=FocusHacks", imageAlt: "Productivity hacks", dataAiHintImage: "productivity office",
    vibes: 125, comments: 18, dataAiHintAvatar: "work professional",
    isRemoved: true, 
    canBeReposted: true, 
    removalReason: "Content marked as removed by admin. Eligible for reposting.",
  },
  {
    id: "tribe_post_hikers_local1", tribeId: "2", authorId: "authorTB", authorName: "Trail Blazer", authorAvatarFallback: "TB",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 86400000 * 1),
    title: "Weekend Hike Recap: Mountain Peak (Tribe Exclusive Pics)",
    content: "The views from Mountain Peak trail were absolutely stunning this weekend! Sharing some extra photos just for our tribe. Highly recommend this route.",
    imageUrl: "https://placehold.co/600x450.png", imageAlt: "Mountain landscape", dataAiHintImage: "mountain landscape",
    vibes: 210, comments: 32, dataAiHintAvatar: "hiker adventurer",
  },
   {
    id: "msp9", tribeId: "2", authorId: "authorLF", authorName: "LocalFoodie", authorAvatarFallback: "LF",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 7),
    title: "Post-Hike Find: Amazing Farmers Market!",
    content: "After our hike near Miller's Pond, stumbled upon this fantastic farmers market. Great fuel and cool local crafts! Shared this to Discover stream too.",
    imageUrl: "https://placehold.co/600x420.png", imageAlt: "Farmers market produce", dataAiHintImage: "market food",
    vibes: 85, comments: 12, dataAiHintAvatar: "foodie person",
  },
  {
    id: "tribe_post_music_local1", tribeId: "7", authorId: "authorGG", authorName: "GigGoer", authorAvatarFallback: "GG",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 1),
    title: "Last Night's Show Was Epic! (Tribe Thoughts)",
    content: "The Local Band absolutely crushed it at The Underground! What did our tribe members think of the new songs?",
    imageUrl: "https://placehold.co/600x380.png", imageAlt: "Concert crowd", dataAiHintImage: "concert crowd",
    vibes: 95, comments: 22, dataAiHintAvatar: "music fan",
  },
  {
    id: "msp8", tribeId: "7", authorId: "authorRD", authorName: "RockstarDev", authorAvatarFallback: "RD",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 8),
    title: "My Stage Setup for Tonight's Gig",
    content: "Sound check done! Ready to rock the 'Music Hall' tonight. Who's coming? Also shared to Create mood stream!",
    imageUrl: "https://placehold.co/600x380.png", imageAlt: "Stage setup with instruments", dataAiHintImage: "stage music",
    vibes: 150, comments: 18, dataAiHintAvatar: "musician band",
  },
  {
    id: "post7", tribeId: "3", authorId: "authorDQ", authorName: "DevQuest", authorAvatarFallback: "DQ",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 3),
    title: "Seeking Beta Testers for New Puzzle Game (Tribe Only)",
    content: "Our indie studio is looking for beta testers for our upcoming mobile puzzle game 'Color Grid'. DM me if you're interested! This is a private post for tribe members.",
    vibes: 40, comments: 5, dataAiHintAvatar: "game developer",
    isRemoved: true, // Test case for a removed post that cannot be reposted by default.
    canBeReposted: false,
    removalReason: "Content removed due to policy violation (Simulated). Reposting not allowed."
  },
];

const moodStreamPostIds = new Set(allMoodStreamPosts.map(p => p.id));

export interface ReportedPost {
  postId: string;
  postTitle?: string;
  reporterName: string;
  reportedAt: Date;
  reason?: string;
}

export let mockReportedContentData: ReportedPost[] = [
  { postId: "msp2", postTitle: "My Top 5 Productivity Hacks for Deep Work", reporterName: "ConcernedUser42", reportedAt: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 1), reason: "This post seems off-topic for the AI Innovators tribe." },
  { postId: "tribe_post_hikers_local1", postTitle: "Weekend Hike Recap: Mountain Peak (Tribe Exclusive Pics)", reporterName: "SafetyFirst", reportedAt: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 1), reason: "Sharing potentially dangerous trail info without proper warnings." },
  { postId: "tribe_post_ai_local1", postTitle: "Local Discussion: Ethics in AI Development", reporterName: "RuleFollower99", reportedAt: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 0.5), reason: "A standard report for a non-removed item, to test queue visibility." },
  { postId: "post7", postTitle: "Seeking Beta Testers for New Puzzle Game (Tribe Only)", reporterName: "QualityAssuranceBot", reportedAt: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 1), reason: "Post content violated beta testing guidelines." }
];

export interface TribeMember {
  id: string;
  name: string;
  avatar: string;
  dataAiHint: string;
  tribeAssignedNickname?: string;
}

export const initialMockMembers: Omit<TribeMember, 'tribeAssignedNickname'>[] = [
  { id: 'user1', name: 'Alice Wonderland', avatar: 'https://placehold.co/40x40.png?text=AW', dataAiHint: 'avatar person' },
  { id: 'user2', name: 'Bob The Builder', avatar: 'https://placehold.co/40x40.png?text=BB', dataAiHint: 'avatar character' },
  { id: 'user3', name: 'Charlie Chaplin', avatar: 'https://placehold.co/40x40.png?text=CC', dataAiHint: 'avatar person' },
];


const TribePostCard: React.FC<{ post: TribePost; isPromoted: boolean; isUserMember: boolean; isTribeAdmin: boolean; isReported: boolean; isCurrentUserAuthor: boolean; onPromoteClick: (post: TribePost) => void; onReportClick: (post: TribePost) => void; onRepostClick: (post: TribePost) => void; }> = ({ post, isPromoted, isUserMember, isTribeAdmin, isReported, isCurrentUserAuthor, onPromoteClick, onReportClick, onRepostClick }) => {
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
                  {isUserMember && isPromoted && !post.isRemoved && (
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
            {(isUserMember || isCurrentUserAuthor) && !post.isRemoved && (
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

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false);
  const [postToPromote, setPostToPromote] = useState<TribePost | null>(null);
  const [locallyPromotedPostIds, setLocallyPromotedPostIds] = useState<Set<string>>(new Set());

  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [postToReport, setPostToReport] = useState<TribePost | null>(null);
  const [reportReason, setReportReason] = useState("");

  const [isRepostDialogOpen, setIsRepostDialogOpen] = useState(false);
  const [postBeingReposted, setPostBeingReposted] = useState<TribePost | null>(null);

  const [currentTribeMembers, setCurrentTribeMembers] = useState<TribeMember[]>([]);
  const [dataTimestamp, setDataTimestamp] = useState(Date.now());
  const [reportsLastUpdated, setReportsLastUpdated] = useState(Date.now());

  const isUserMember = true;
  const isTribeAdmin = true;


  useEffect(() => {
    if (tribeId) {
      const currentTribeData = tribesData.find(t => t.id === tribeId);
      if (currentTribeData) {
        setTribe(currentTribeData);
         const membersForThisTribe = initialMockMembers.map(member => ({
            ...member,
            tribeAssignedNickname: (member.id === 'user1' && tribeId === '1') ? 'AI Lead' :
                                   (member.id === 'user2' && tribeId === '2') ? 'Trail Master' : undefined
        }));
        setCurrentTribeMembers(membersForThisTribe);
        setDataTimestamp(Date.now());
        setReportsLastUpdated(Date.now());
      } else {
        router.push('/tribes');
      }
    }
  }, [tribeId, router]);

  useEffect(() => {
    const handleFocus = () => {
        setDataTimestamp(Date.now());
        setReportsLastUpdated(Date.now());
    };
    window.addEventListener('focus', handleFocus);
    return () => {
        window.removeEventListener('focus', handleFocus);
    };
  }, []);


  const tribeEvents = useMemo(() => {
    if (!tribe) return [];
    return sampleEventsData
      .filter(event => event.associatedTribe === tribe.name)
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
  }, [tribe, dataTimestamp]);

  const postsInTribe = useMemo(() => {
    if (!tribe) return [];
    return initialSampleTribePosts
      .filter(post =>
        post.tribeId === tribe.id &&
        !(post.isRemoved === true && post.canBeReposted === false) 
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [tribe, dataTimestamp]);

  const activeReportedPostIds = useMemo(() => {
    const notRemovedPostIds = new Set(initialSampleTribePosts.filter(p => !p.isRemoved).map(p => p.id));
    return new Set(mockReportedContentData.filter(report => notRemovedPostIds.has(report.postId)).map(report => report.postId));
  }, [dataTimestamp, reportsLastUpdated]);


  const currentTribeReportedPostsForDashboard = useMemo(() => {
    if (!tribe) return [];
    const postsInThisTribeNotRemovedIds = new Set(
        initialSampleTribePosts
            .filter(p => p.tribeId === tribe.id && !p.isRemoved)
            .map(p => p.id)
    );
    return mockReportedContentData.filter(report => postsInThisTribeNotRemovedIds.has(report.postId));
  }, [tribe, dataTimestamp, reportsLastUpdated]);


  const combinedFeedItems = useMemo(() => {
    if (!tribe) return [];

    const eventItems = (isUserMember ? tribeEvents : [])
      .map(event => ({
        id: `event-${event.id}`,
        type: 'event' as const,
        timestamp: event.eventDate,
        isPinned: true,
        data: event,
      }));

    const postItems = (isUserMember ? postsInTribe : postsInTribe.filter(p => moodStreamPostIds.has(p.id) || locallyPromotedPostIds.has(p.id)))
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
  }, [tribe, tribeEvents, postsInTribe, isUserMember, locallyPromotedPostIds, activeReportedPostIds, dataTimestamp]);


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

  const handleConfirmPromotion = (postId: string, selectedMoodSlugs: string[]) => {
    console.log(`User confirmed promotion: Post ID ${postId} to moods: ${selectedMoodSlugs.join(', ')}`);
    setLocallyPromotedPostIds(prev => new Set(prev).add(postId));
    toast({
      title: "Post Promoted",
      description: `Post "${postToPromote?.title || postId}" has been successfully promoted to ${selectedMoodSlugs.length} mood stream(s). (Simulated)`,
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

  const handleConfirmReport = () => {
    if (!postToReport) return;

    mockReportedContentData.push({
        postId: postToReport.id,
        postTitle: postToReport.title,
        reporterName: "You (Simulated User)",
        reportedAt: new Date(),
        reason: reportReason.trim() || "No reason provided.",
    });
    setReportsLastUpdated(Date.now());

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

  const handleConfirmRepost = (editedContent: string, originalPostTitle?: string) => {
    if (!postBeingReposted || !tribe) return;

    const newPost: TribePost = {
      id: `repost-${postBeingReposted.id}-${Date.now()}`,
      tribeId: tribe.id,
      authorId: postBeingReposted.authorId,
      authorName: postBeingReposted.authorName,
      authorAvatar: postBeingReposted.authorAvatar,
      authorAvatarFallback: postBeingReposted.authorAvatarFallback,
      dataAiHintAvatar: postBeingReposted.dataAiHintAvatar,
      timestamp: new Date(),
      title: originalPostTitle ? `Repost: ${originalPostTitle}` : `Repost: ${postBeingReposted.title || "Untitled"}`,
      content: editedContent,
      imageUrl: postBeingReposted.imageUrl,
      imageAlt: postBeingReposted.imageAlt,
      dataAiHintImage: postBeingReposted.dataAiHintImage,
      vibes: 0,
      comments: 0,
      isRemoved: false,
      canBeReposted: true, // A new repost is itself repostable unless removed again
      originalPostId: postBeingReposted.id,
    };

    const originalPostIndex = initialSampleTribePosts.findIndex(p => p.id === postBeingReposted.id);
    if (originalPostIndex > -1) {
      initialSampleTribePosts[originalPostIndex] = {
        ...initialSampleTribePosts[originalPostIndex],
        canBeReposted: false, // Original can no longer be reposted
      };
    }

    initialSampleTribePosts.unshift(newPost); // Add new post to the top

    setDataTimestamp(Date.now()); // Trigger re-render
    toast({
      title: "Post Reposted",
      description: `Your post has been successfully reposted to ${tribe.name}.`,
    });
    setIsRepostDialogOpen(false);
    setPostBeingReposted(null);
  };


  if (!tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading tribe details...</p>
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
        </CardContent>
      </Card>

      {isUserMember && (
        <Card className="shadow-lg">
            <CardHeader className="p-4 flex-row items-center space-x-3">
                <Avatar>
                    <AvatarImage src="https://placehold.co/40x40.png" alt="User" data-ai-hint="current user avatar"/>
                    <AvatarFallback>ME</AvatarFallback>
                </Avatar>
                <Button variant="outline" className="flex-1 justify-start text-muted-foreground">
                    What's on your mind, User?
                </Button>
            </CardHeader>
            <CardFooter className="p-4 pt-0 flex justify-end">
                <Button className="bg-primary hover:bg-primary/90">
                    <Edit3 className="mr-2 h-4 w-4" /> Create Post
                </Button>
            </CardFooter>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground tracking-normal px-1">
            {isUserMember ? "Feed" : "Featured Posts in Mood Streams"}
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
                  isUserMember={isUserMember}
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
                {isUserMember ? `No Posts Yet in ${tribe.name}` : `No Featured Posts from ${tribe.name} in Mood Streams`}
              </h3>
              <p className="text-muted-foreground">
                {isUserMember ? `Be the first to share something!` : "Check back later for promoted content from this tribe."}
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
    </div>
  );
}
    
