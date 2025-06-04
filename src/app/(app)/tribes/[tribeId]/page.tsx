
"use client";

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Users, MessageSquareText, ThumbsUp, Share2, Edit3, Image as ImageIcon, Settings } from "lucide-react";

import { tribesData, type Tribe } from '../page'; // Assuming tribesData and Tribe type are exported
import { moodsData } from '../../moods/page'; // For mood badges

// Define an interface for a tribe post
interface TribePost {
  id: string;
  tribeId: string;
  authorName: string;
  authorAvatar?: string; // URL to avatar image
  authorAvatarFallback: string;
  timestamp: Date;
  title?: string;
  content: string;
  imageUrl?: string; // URL to an image for the post
  imageAlt?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
  vibes?: number;
  comments?: number;
}

// Sample data for tribe posts (ensure tribeId matches existing tribes)
const sampleTribePosts: TribePost[] = [
  {
    id: "post1", tribeId: "1", authorName: "AI Enthusiast", authorAvatarFallback: "AE",
    timestamp: new Date(Date.now() - 3600000 * 2), // 2 hours ago
    title: "Breakthrough in Generative Models!",
    content: "Just read an amazing paper on a new technique for generating highly realistic images. The implications for creative industries are huge. What are your thoughts?",
    imageUrl: "https://placehold.co/600x400.png", imageAlt: "Abstract AI art", dataAiHintImage: "abstract ai",
    vibes: 120, comments: 15, dataAiHintAvatar: "researcher scientist",
  },
  {
    id: "post2", tribeId: "1", authorName: "Code Wiz", authorAvatarFallback: "CW",
    timestamp: new Date(Date.now() - 3600000 * 5), // 5 hours ago
    content: "Anyone experimented with the latest Genkit features? Looking for tips on integrating custom tools.",
    vibes: 75, comments: 8, dataAiHintAvatar: "developer coder",
  },
  {
    id: "post3", tribeId: "2", authorName: "Trail Blazer", authorAvatarFallback: "TB",
    timestamp: new Date(Date.now() - 86400000 * 1), // 1 day ago
    title: "Weekend Hike Recap: Mountain Peak",
    content: "The views from Mountain Peak trail were absolutely stunning this weekend! Sharing some photos. Highly recommend this route if you're up for a challenge.",
    imageUrl: "https://placehold.co/600x450.png", imageAlt: "Mountain landscape", dataAiHintImage: "mountain landscape",
    vibes: 210, comments: 32, dataAiHintAvatar: "hiker adventurer",
  },
  {
    id: "post4", tribeId: "2", authorName: "Nature Lover", authorAvatarFallback: "NL",
    timestamp: new Date(Date.now() - 3600000 * 8), // 8 hours ago
    content: "Spotted some rare wildflowers on the valley loop trail today. Anyone know what these are called?",
    vibes: 60, comments: 7, dataAiHintAvatar: "nature person",
  },
  {
    id: "post5", tribeId: "7", authorName: "GigGoer", authorAvatarFallback: "GG",
    timestamp: new Date(Date.now() - 3600000 * 1),
    title: "Last Night's Show Was Epic!",
    content: "The Local Band absolutely crushed it at The Underground last night! Who else was there? The energy was insane. #livemusic",
    imageUrl: "https://placehold.co/600x380.png", imageAlt: "Concert crowd", dataAiHintImage: "concert crowd",
    vibes: 95, comments: 22, dataAiHintAvatar: "music fan",
  },
  {
    id: "post6", tribeId: "7", authorName: "Venue Promoter", authorAvatarFallback: "VP",
    timestamp: new Date(Date.now() - 86400000 * 2),
    content: "Just announced: Indie Fest is coming to town next month! Check out the lineup on our website. Early bird tickets available now through 'The Local Gig Circuit' tribe pass!",
    vibes: 150, comments: 18, dataAiHintAvatar: "promoter event",
  },
  { // Add a post for a tribe that might not have many, to test empty state
    id: "post7", tribeId: "3", authorName: "DevQuest", authorAvatarFallback: "DQ",
    timestamp: new Date(Date.now() - 3600000 * 3),
    title: "Seeking Beta Testers for New Puzzle Game",
    content: "Our indie studio is looking for beta testers for our upcoming mobile puzzle game 'Color Grid'. DM me if you're interested! (Private tribe post)",
    vibes: 40, comments: 5, dataAiHintAvatar: "game developer",
  },
];

// Component to render individual TribePost
const TribePostCard: React.FC<{ post: TribePost }> = ({ post }) => {
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
    <Card className="overflow-hidden shadow-lg">
      <CardHeader className="p-4 pb-2">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10 border">
            {post.authorAvatar && <AvatarImage src={post.authorAvatar} alt={post.authorName} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
            <AvatarFallback>{post.authorAvatarFallback}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-md font-semibold tracking-normal">{post.authorName}</CardTitle>
            <CardDescription className="text-xs">{displayTime}</CardDescription>
          </div>
          {/* Future: Add options like edit/delete for post author */}
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
          <Share2 className="mr-1.5 h-4 w-4" /> Share
        </Button>
      </CardFooter>
    </Card>
  );
};


export default function TribeDetailPage() {
  const router = useRouter();
  const params = useParams();
  const tribeId = params.tribeId as string;

  const [tribe, setTribe] = useState<Tribe | null>(null);
  const [postsInTribe, setPostsInTribe] = useState<TribePost[]>([]);

  useEffect(() => {
    if (tribeId) {
      const currentTribe = tribesData.find(t => t.id === tribeId);
      if (currentTribe) {
        setTribe(currentTribe);
        const filteredPosts = sampleTribePosts
          .filter(post => post.tribeId === tribeId)
          .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setPostsInTribe(filteredPosts);
      } else {
        // Handle tribe not found, e.g., redirect or show error
        router.push('/tribes');
      }
    }
  }, [tribeId, router]);

  if (!tribe) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-muted-foreground">Loading tribe details...</p>
      </div>
    );
  }

  const tribeMoodObjects = tribe.moods?.map(slug => moodsData.find(m => m.slug === slug)).filter(Boolean) || [];

  return (
    <div className="space-y-6 pb-12">
      <Card className="overflow-hidden shadow-xl relative">
        <div className="absolute top-4 left-4 z-10">
          <Button variant="outline" size="icon" onClick={() => router.back()} className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </div>
        <div className="absolute top-4 right-4 z-10">
          <Button variant="outline" size="icon" className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
            <Settings className="h-5 w-5" /> {/* Placeholder for Tribe Settings */}
          </Button>
        </div>
        <div className="relative h-48 md:h-64 w-full">
          <Image
            src={tribe.cover}
            alt={`${tribe.name} cover image`}
            layout="fill"
            objectFit="cover"
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
            <div className="flex items-center text-xs text-gray-200 drop-shadow-sm">
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

      {/* New Post Input Area - Placeholder */}
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

      {/* Feed of Tribe Posts */}
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-foreground tracking-normal">Recent Posts</h2>
        {postsInTribe.length > 0 ? (
          postsInTribe.map(post => <TribePostCard key={post.id} post={post} />)
        ) : (
          <Card className="text-center py-12 shadow-md">
            <CardContent className="flex flex-col items-center justify-center">
              <MessageSquareText className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-1">No Posts Yet</h3>
              <p className="text-muted-foreground">Be the first to share something in <span className="font-semibold">{tribe.name}</span>!</p>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}

