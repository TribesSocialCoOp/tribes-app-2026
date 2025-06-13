
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
import { ArrowLeft, Users, MessageSquareText, ThumbsUp, SquareArrowUp, Edit3, Settings, Rss, CalendarDays, MapPin, ShieldAlert, UserCog, MoreVertical, Flag, Eye, ChevronDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from '@/components/ui/separator';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from '@/lib/utils';
import { useToast } from "@/hooks/use-toast";

import { tribesData, type Tribe } from '../page';
import { moodsData } from '../../moods/page';
import { allMoodStreamPosts } from '../../moods/[moodSlug]/page'; 
import type { Event } from '../../events/[eventId]/page';
import { sampleEventsData } from '../../events/[eventId]/page';
import { PromotePostDialog } from '@/components/dialogs/boost-post-dialog'; // Component renamed, filename is boost-post-dialog

export interface TribePost {
  id: string;
  tribeId: string;
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
}

const MOCK_CURRENT_DATE_MS = new Date("2025-06-08T10:00:00.000Z").getTime();

const sampleTribePosts: TribePost[] = [
  {
    id: "tribe_post_ai_local1", tribeId: "1", authorName: "AI Enthusiast", authorAvatarFallback: "AE",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 2),
    title: "Local Discussion: Ethics in AI Development",
    content: "Starting a thread specifically for our tribe members on the ethical considerations of recent AI breakthroughs. What are your immediate thoughts?",
    vibes: 30, comments: 5, dataAiHintAvatar: "researcher scientist",
  },
  {
    id: "msp2", tribeId: "1", authorName: "ProductivePro", authorAvatarFallback: "PP", 
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 3),
    title: "My Top 5 Productivity Hacks for Deep Work",
    content: "Sharing my secrets to staying in the zone! Tip #1: Time blocking is key. This was also shared to the Focus mood stream.",
    imageUrl: "https://placehold.co/600x400.png?text=FocusHacks", imageAlt: "Productivity hacks", dataAiHintImage: "productivity office",
    vibes: 125, comments: 18, dataAiHintAvatar: "work professional",
  },
  {
    id: "tribe_post_hikers_local1", tribeId: "2", authorName: "Trail Blazer", authorAvatarFallback: "TB",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 86400000 * 1),
    title: "Weekend Hike Recap: Mountain Peak (Tribe Exclusive Pics)",
    content: "The views from Mountain Peak trail were absolutely stunning this weekend! Sharing some extra photos just for our tribe. Highly recommend this route.",
    imageUrl: "https://placehold.co/600x450.png", imageAlt: "Mountain landscape", dataAiHintImage: "mountain landscape",
    vibes: 210, comments: 32, dataAiHintAvatar: "hiker adventurer",
  },
   {
    id: "msp9", tribeId: "2", authorName: "LocalFoodie", authorAvatarFallback: "LF", 
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 7),
    title: "Post-Hike Find: Amazing Farmers Market!",
    content: "After our hike near Miller's Pond, stumbled upon this fantastic farmers market. Great fuel and cool local crafts! Shared this to Discover stream too.",
    imageUrl: "https://placehold.co/600x420.png", imageAlt: "Farmers market produce", dataAiHintImage: "market food",
    vibes: 85, comments: 12, dataAiHintAvatar: "foodie person",
  },
  {
    id: "tribe_post_music_local1", tribeId: "7", authorName: "GigGoer", authorAvatarFallback: "GG",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 1),
    title: "Last Night's Show Was Epic! (Tribe Thoughts)",
    content: "The Local Band absolutely crushed it at The Underground! What did our tribe members think of the new songs?",
    imageUrl: "https://placehold.co/600x380.png", imageAlt: "Concert crowd", dataAiHintImage: "concert crowd",
    vibes: 95, comments: 22, dataAiHintAvatar: "music fan",
  },
  {
    id: "msp8", tribeId: "7", authorName: "RockstarDev", authorAvatarFallback: "RD", 
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 8),
    title: "My Stage Setup for Tonight's Gig",
    content: "Sound check done! Ready to rock the 'Music Hall' tonight. Who's coming? Also shared to Create mood stream!",
    imageUrl: "https://placehold.co/600x380.png", imageAlt: "Stage setup with instruments", dataAiHintImage: "stage music",
    vibes: 150, comments: 18, dataAiHintAvatar: "musician band",
  },
  {
    id: "post7", tribeId: "3", authorName: "DevQuest", authorAvatarFallback: "DQ",
    timestamp: new Date(MOCK_CURRENT_DATE_MS - 3600000 * 3),
    title: "Seeking Beta Testers for New Puzzle Game (Tribe Only)",
    content: "Our indie studio is looking for beta testers for our upcoming mobile puzzle game 'Color Grid'. DM me if you're interested! This is a private post for tribe members.",
    vibes: 40, comments: 5, dataAiHintAvatar: "game developer",
  },
];

const moodStreamPostIds = new Set(allMoodStreamPosts.map(p => p.id));

const TribePostCard: React.FC<{ post: TribePost; isPromoted: boolean; isUserMember: boolean; isTribeAdmin: boolean; onPromoteClick: (post: TribePost) => void; }> = ({ post, isPromoted, isUserMember, isTribeAdmin, onPromoteClick }) => {
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

  const handleReportPost = () => {
    alert(`Post "${post.title || post.id}" reported. (Simulated)`);
  };

  return (
    <Card className={cn(
        "overflow-hidden shadow-lg",
        isPromoted && "bg-accent/5 hover:bg-accent/10 border-accent/30"
      )}>
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
                {isUserMember && isPromoted && (
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
            </div>
          </div>
           {isUserMember && (
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
                <DropdownMenuItem onClick={handleReportPost}>
                  <Flag className="mr-2 h-4 w-4" /> Report Post
                </DropdownMenuItem>
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
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
          <ThumbsUp className="mr-1.5 h-4 w-4" /> {post.vibes || 0}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
          <MessageSquareText className="mr-1.5 h-4 w-4" /> {post.comments || 0}
        </Button>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
          <SquareArrowUp className="mr-1.5 h-4 w-4" /> Share
        </Button>
      </CardFooter>
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
  | { id: string; type: 'post'; timestamp: Date; isPinned: boolean; data: TribePost; isPromoted: boolean };


export default function TribeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;
  const { toast } = useToast();

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [isPromoteDialogOpen, setIsPromoteDialogOpen] = useState(false); 
  const [postToPromote, setPostToPromote] = useState<TribePost | null>(null); 
  const [locallyPromotedPostIds, setLocallyPromotedPostIds] = useState<Set<string>>(new Set());

  const isUserMember = true; 
  const isTribeAdmin = true; 

  const mockMembers = [
    { id: 'user1', name: 'Alice Wonderland', avatar: 'https://placehold.co/40x40.png?text=AW', dataAiHint: 'avatar person' },
    { id: 'user2', name: 'Bob The Builder', avatar: 'https://placehold.co/40x40.png?text=BB', dataAiHint: 'avatar character' },
    { id: 'user3', name: 'Charlie Chaplin', avatar: 'https://placehold.co/40x40.png?text=CC', dataAiHint: 'avatar person' },
  ];
  const mockReportedContent: any[] = [];


  useEffect(() => {
    if (tribeId) {
      const currentTribe = tribesData.find(t => t.id === tribeId);
      if (currentTribe) {
        setTribe(currentTribe);
      } else {
        router.push('/tribes');
      }
    }
  }, [tribeId, router]);

  const tribeEvents = useMemo(() => {
    if (!tribe) return [];
    return sampleEventsData
      .filter(event => event.associatedTribe === tribe.name)
      .sort((a, b) => a.eventDate.getTime() - b.eventDate.getTime());
  }, [tribe]);

  const postsInTribe = useMemo(() => {
    if (!tribe) return [];
    return sampleTribePosts
        .filter(post => post.tribeId === tribe.id)
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [tribe]);

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
        isPromoted: moodStreamPostIds.has(post.id) || locallyPromotedPostIds.has(post.id)
      }));

    const allItems: FeedItem[] = [...eventItems, ...postItems];

    allItems.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });

    return allItems;
  }, [tribe, tribeEvents, postsInTribe, isUserMember, locallyPromotedPostIds]);


  const handleOpenPromoteDialog = (post: TribePost) => { 
    if (moodStreamPostIds.has(post.id) || locallyPromotedPostIds.has(post.id)) {
      toast({
        title: "Already Promoted",
        description: `"${post.title || 'This post'}" is already promoted.`,
      });
      return;
    }
    setPostToPromote(post); 
    setIsPromoteDialogOpen(true); 
  };

  const handleConfirmPromotion = (postId: string, selectedMoodSlugs: string[]) => { 
    console.log(`Promoting post ID: ${postId} to moods: ${selectedMoodSlugs.join(', ')}`);
    setLocallyPromotedPostIds(prev => new Set(prev).add(postId));
    toast({
      title: "Post Promoted",
      description: `Post "${postToPromote?.title || postId}" has been successfully promoted to ${selectedMoodSlugs.length} mood stream(s).`,
    });
    setPostToPromote(null); 
  };


  if (!tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading tribe details...</p>
      </div>
    );
  }

  const tribeMoodObjects = tribe.moods?.map(slug => moodsData.find(m => m.slug === slug)).filter(Boolean) || [];

  const handleMuteUser = (userId: string, userName: string) => {
    alert(`User ${userName} muted in tribe. (Simulated)`);
  };

  const handleRemoveUser = (userId: string, userName: string) => {
    alert(`User ${userName} removed from tribe. (Simulated)`);
  };

  const handleViewUserProfile = (userId: string) => {
    alert(`Viewing profile for user ID: ${userId}. (Simulated)`);
  };


  return (
    <div className="space-y-6 pb-12">
      {isTribeAdmin && (
        <Accordion type="single" collapsible className="w-full" defaultValue="admin-tools-closed">
          <AccordionItem value="admin-tools" className="border-destructive/30 rounded-lg shadow-lg overflow-hidden">
              <AccordionTrigger className="w-full hover:bg-muted/20 transition-colors p-4 hover:no-underline rounded-t-lg">
                <div className="flex items-center space-x-3"> 
                  <ShieldAlert className="h-6 w-6 text-destructive" />
                  <div>
                    <CardTitle className="text-xl font-semibold tracking-normal text-destructive text-left">Tribe Admin Tools</CardTitle>
                    <CardDescription className="text-sm text-left">
                      Manage members, content, and settings for <span className="font-medium">{tribe.name}</span>.
                    </CardDescription>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="space-y-6 p-4 pt-2">
                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-2 flex items-center">
                      <UserCog className="mr-2 h-5 w-5 text-muted-foreground" /> Member Management
                    </h3>
                    {mockMembers.length > 0 ? (
                      <ul className="space-y-2">
                        {mockMembers.map(member => (
                          <li key={member.id} className="flex items-center justify-between p-3 bg-muted/30 rounded-md">
                            <div className="flex items-center space-x-3">
                              <Avatar className="h-8 w-8">
                                <AvatarImage src={member.avatar} alt={member.name} data-ai-hint={member.dataAiHint} />
                                <AvatarFallback>{member.name.substring(0,2)}</AvatarFallback>
                              </Avatar>
                              <span className="text-sm font-medium">{member.name}</span>
                            </div>
                            <div className="flex items-center space-x-1">
                              <Button variant="ghost" size="sm" onClick={() => handleViewUserProfile(member.id)}>View</Button>
                              <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-8 w-8">
                                          <MoreVertical className="h-4 w-4" />
                                      </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                      <DropdownMenuItem onClick={() => handleMuteUser(member.id, member.name)}>Mute in Tribe</DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => handleRemoveUser(member.id, member.name)} className="text-destructive">Remove from Tribe</DropdownMenuItem>
                                  </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">No members to manage currently.</p>
                    )}
                  </div>
                  <Separator />
                  <div>
                    <h3 className="text-lg font-medium text-foreground mb-2">Reported Content Queue</h3>
                    {mockReportedContent.length > 0 ? (
                      <p className="text-sm text-muted-foreground">Display reported items here...</p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No reported content at this time.</p>
                    )}
                  </div>
                  <Separator />
                  <div>
                      <Button variant="outline" className="w-full sm:w-auto">
                          <Settings className="mr-2 h-4 w-4"/> Edit Tribe Settings
                      </Button>
                  </div>
                </div>
              </AccordionContent>
          </AccordionItem>
        </Accordion>
      )}


      <Card className="overflow-hidden shadow-xl relative">
        <div className="absolute top-4 left-4 z-10">
          <Button variant="outline" size="icon" onClick={() => router.back()} className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        {isTribeAdmin && (
            <div className="absolute top-4 right-4 z-10">
            <Button variant="outline" size="icon" className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
                <Settings className="h-5 w-5" />
            </Button>
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
            return <TribePostCard key={item.id} post={post} isPromoted={item.isPromoted} isUserMember={isUserMember} isTribeAdmin={isTribeAdmin} onPromoteClick={handleOpenPromoteDialog} />;
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
      {postToPromote && (
        <PromotePostDialog 
          isOpen={isPromoteDialogOpen}
          onOpenChange={setIsPromoteDialogOpen}
          post={postToPromote}
          onConfirmPromotion={handleConfirmPromotion} 
        />
      )}
    </div>
  );
}

