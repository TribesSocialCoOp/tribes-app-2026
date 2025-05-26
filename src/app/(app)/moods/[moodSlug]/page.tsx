
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, MessageSquareText, Settings2, Smile as VibeIcon } from 'lucide-react'; // Renamed Smile to VibeIcon for clarity
import { moodsData } from '../page'; // Import moodsData for the tuner
import { cn } from '@/lib/utils';

interface MoodStreamPost {
  id: string;
  title?: string; // Optional title for articles or longer posts
  content: string;
  author: string; 
  authorAvatarSrc?: string;
  authorAvatarFallback?: string;
  tribeName?: string; // If content is from a tribe
  imageUrl?: string; 
  imageAlt?: string; 
  moodTags: string[]; // e.g., ["chill-vibes", "relaxing"]
  timestamp: Date;
  likes?: number; // This will represent total "vibes"
  comments?: number;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
}

// Mock Data for Mood Stream Posts
const allMoodStreamPosts: MoodStreamPost[] = [
  { id: "msp1", content: "Just found this amazing ambient playlist, perfect for a #chill-vibes afternoon. 🎶", author: "MusicLover22", moodTags: ["chill-vibes"], timestamp: new Date(Date.now() - 3600000 * 1), likes: 15, comments: 3, authorAvatarSrc: "https://placehold.co/40x40.png?text=ML", authorAvatarFallback: "ML", dataAiHintAvatar: "music person" },
  { id: "msp2", title: "My Top 5 Productivity Hacks for Deep Work", content: "Sharing my secrets to staying in the zone! Tip #1: Time blocking is key. #focused-work", author: "ProductivePro", tribeName: "Focus Finders", moodTags: ["focused-work", "productivity"], timestamp: new Date(Date.now() - 3600000 * 3), likes: 45, comments: 12, authorAvatarSrc: "https://placehold.co/40x40.png?text=PP", authorAvatarFallback: "PP", dataAiHintAvatar: "work professional" },
  { id: "msp3", content: "Sketching some new character designs today. Feeling super inspired! #creative-spark", author: "ArtByLena", moodTags: ["creative-spark", "art"], timestamp: new Date(Date.now() - 3600000 * 5), imageUrl: "https://placehold.co/600x400.png", imageAlt: "Sketchbook with character designs", likes: 72, comments: 8, authorAvatarSrc: "https://placehold.co/40x40.png?text=AL", authorAvatarFallback: "AL", dataAiHintAvatar: "artist design", dataAiHintImage: "sketch art" },
  { id: "msp4", content: "Weekend plan: hiking up Mount Vista! Who's explored this trail before? Any tips? #weekend-adventure 🏞️", author: "TrailBlazerTom", moodTags: ["weekend-adventure", "hiking"], timestamp: new Date(Date.now() - 3600000 * 10), likes: 33, comments: 7, authorAvatarSrc: "https://placehold.co/40x40.png?text=TB", authorAvatarFallback: "TB", dataAiHintAvatar: "hiker nature" },
  { id: "msp5", content: "Just unboxed the new Pixel 9! First impressions are 🔥. AMA! #tech-talks", author: "GadgetGuru", moodTags: ["tech-talks", "gadgets"], timestamp: new Date(Date.now() - 3600000 * 12), imageUrl: "https://placehold.co/600x350.png", imageAlt: "New Pixel 9 phone unboxing", likes: 102, comments: 25, authorAvatarSrc: "https://placehold.co/40x40.png?text=GG", authorAvatarFallback: "GG", dataAiHintAvatar: "tech reviewer", dataAiHintImage: "phone gadget" },
  { id: "msp6", content: "Just hit a new high score in 'Cyber Runner'! So stoked. #gaming-zone 🏆", author: "ProGamerX", moodTags: ["gaming-zone"], timestamp: new Date(Date.now() - 3600000 * 15), likes: 60, comments: 18, authorAvatarSrc: "https://placehold.co/40x40.png?text=PG", authorAvatarFallback: "PG", dataAiHintAvatar: "gamer person"},
  { id: "msp7", content: "Sunday morning coffee and a good book. Pure bliss. #chill-vibes", author: "ReaderLife", moodTags: ["chill-vibes", "reading"], timestamp: new Date(Date.now() - 3600000 * 2), imageUrl: "https://placehold.co/600x450.png", imageAlt: "Coffee and book", dataAiHintImage: "coffee book", dataAiHintAvatar: "reader person" },
  { id: "msp8", content: "My creative space setup. Where the magic happens! #creative-spark", author: "DesignerDesk", moodTags: ["creative-spark", "design"], timestamp: new Date(Date.now() - 3600000 * 8), imageUrl: "https://placehold.co/600x380.png", imageAlt: "Designer desk setup", dataAiHintImage: "desk workspace", dataAiHintAvatar: "designer person" },
  { id: "msp9", title: "Farmers Market Haul!", content: "Fresh produce from today's market. So excited to cook with these! #local-streams", author: "LocalFoodie", moodTags: ["local-streams", "food"], timestamp: new Date(Date.now() - 3600000 * 2), imageUrl: "https://placehold.co/600x420.png", imageAlt: "Farmers market produce", likes: 28, comments: 5, authorAvatarSrc: "https://placehold.co/40x40.png?text=LF", authorAvatarFallback: "LF", dataAiHintAvatar: "foodie person", dataAiHintImage: "market food" },
  { id: "msp10", content: "Community cleanup event this Saturday at 10 AM. Let's make our neighborhood shine! #local-streams", author: "NeighborhoodWatch", tribeName: "City Volunteers", moodTags: ["local-streams", "community"], timestamp: new Date(Date.now() - 3600000 * 24), likes: 55, comments: 10, dataAiHintAvatar: "community group" },
  { id: "msp11", title: "Best 50% Off Deals This Week", content: "Found some amazing discounts on electronics and fashion. Check out the link in bio! #shopping-finds", author: "DealHunter", moodTags: ["shopping-finds", "deals"], timestamp: new Date(Date.now() - 3600000 * 4), likes: 88, comments: 22, authorAvatarSrc: "https://placehold.co/40x40.png?text=DH", authorAvatarFallback: "DH", dataAiHintAvatar: "shopper person" },
  { id: "msp12", content: "New sneaker drop alert! These are going to sell out fast. 👟 #shopping-finds", author: "SneakerHead", moodTags: ["shopping-finds", "fashion"], timestamp: new Date(Date.now() - 3600000 * 6), imageUrl: "https://placehold.co/600x370.png", imageAlt: "New sneakers", likes: 115, comments: 30, authorAvatarSrc: "https://placehold.co/40x40.png?text=SH", authorAvatarFallback: "SH", dataAiHintAvatar: "fashion person", dataAiHintImage: "sneakers shoes" },
];

const MoodStreamPostCard: React.FC<{ post: MoodStreamPost }> = ({ post }) => {
  const [displayTime, setDisplayTime] = useState<string>(' ');
  const emoticons = ["😊", "😍", "😂", "🤔", "🔥", "🎉"];

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
      if (interval < 7) return `${interval}d ago`;
      if (interval < 30) return `${Math.floor(interval/7)}w ago`;
      interval = Math.floor(seconds / 2592000);
      if (interval < 12) return `${interval}mo ago`;
      return `${Math.floor(seconds / 31536000)}y ago`;
    };
    setDisplayTime(timeSince(post.timestamp));
  }, [post.timestamp]);

  const handleVibeSelection = (vibe: string) => {
    console.log(`User vibed with: ${vibe} on post ${post.id}`);
    // Here you would typically update state or call an API
    // For now, we'll just close the popover if one is open or handle the vibe
  };

  return (
    <Card className="overflow-hidden shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200">
      <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10 border">
            {post.authorAvatarSrc && <AvatarImage src={post.authorAvatarSrc} alt={post.author} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
            <AvatarFallback>{post.authorAvatarFallback || post.author.substring(0,2)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <CardTitle className="text-sm font-semibold leading-tight">{post.author} {post.tribeName && <span className="text-xs text-muted-foreground font-normal">in {post.tribeName}</span>}</CardTitle>
            <CardDescription className="text-xs">{displayTime}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-1 sm:pt-2">
        {post.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground">{post.title}</h3>}
        {post.imageUrl && (
          <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-md border">
            <Image 
              src={post.imageUrl} 
              alt={post.imageAlt || "Mood stream media"} 
              fill
              style={{ objectFit: 'cover' }}
              data-ai-hint={post.dataAiHintImage || "media content"}
            />
          </div>
        )}
        <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{post.content}</p>
      </CardContent>
      {(post.likes !== undefined || post.comments !== undefined) && (
        <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start space-x-4 border-t">
          {post.likes !== undefined && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                  <VibeIcon className="mr-1.5 h-4 w-4" /> {post.likes}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2 bg-card border shadow-xl rounded-lg">
                <div className="flex space-x-1">
                  {emoticons.map((emo, index) => (
                    <Button 
                      key={index} 
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
          {post.comments !== undefined && (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
              <MessageSquareText className="mr-1.5 h-4 w-4" /> {post.comments}
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
};


export default function MoodStreamPage() {
  const router = useRouter();
  const params = useParams();
  const moodSlug = params.moodSlug as string;

  const [isTunerVisible, setIsTunerVisible] = useState(true);
  const [currentMoodName, setCurrentMoodName] = useState("Mood Stream");
  const [selectedMoodForTuner, setSelectedMoodForTuner] = useState(moodSlug);

  useEffect(() => {
    const currentMoodObject = moodsData.find(m => m.slug === moodSlug);
    if (currentMoodObject) {
      setCurrentMoodName(currentMoodObject.name);
      setSelectedMoodForTuner(moodSlug); // Ensure tuner select is in sync
    } else {
      // Handle case where slug doesn't match any mood, maybe redirect or show error
      setCurrentMoodName("Unknown Mood");
    }
  }, [moodSlug]);

  const filteredPosts = useMemo(() => {
    if (!moodSlug) return allMoodStreamPosts; // Or an empty array if no specific mood means show nothing
    return allMoodStreamPosts.filter(post => post.moodTags.includes(moodSlug))
      .sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [moodSlug]);

  const handleTuneMood = () => {
    if (selectedMoodForTuner && selectedMoodForTuner !== moodSlug) {
      router.push(`/moods/${selectedMoodForTuner}`);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 relative">
      {isTunerVisible && (
        <Card className="sticky top-2 sm:top-4 left-0 right-0 z-10 shadow-xl bg-background/90 backdrop-blur-sm border">
          <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3 flex flex-row items-center justify-between">
            <div className='flex items-center'>
              <Settings2 className="h-5 w-5 mr-2 text-primary" />
              <CardTitle className="text-md sm:text-lg font-semibold">Tune Your Mood</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsTunerVisible(false)} className="h-7 w-7 sm:h-8 sm:w-8">
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </Button>
          </CardHeader>
          <CardContent className="p-3 sm:p-4 pt-0 space-y-3">
            <Select value={selectedMoodForTuner} onValueChange={setSelectedMoodForTuner}>
              <SelectTrigger className="w-full text-base">
                <SelectValue placeholder="Select a mood..." />
              </SelectTrigger>
              <SelectContent>
                {moodsData.map(mood => (
                  <SelectItem key={mood.slug} value={mood.slug} className="text-base">
                    <span className="mr-2">{mood.emoji}</span>{mood.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={handleTuneMood} className="w-full bg-primary hover:bg-primary/90" disabled={selectedMoodForTuner === moodSlug}>
              Tune to Selected Mood
            </Button>
          </CardContent>
        </Card>
      )}

      <header className={cn("mb-4 md:mb-6", isTunerVisible && "pt-4")}> {/* Add padding top if tuner is visible */}
        <div className="flex items-center space-x-2 mb-1">
            <VibeIcon className="h-7 w-7 md:h-8 md:w-8 text-primary" /> {/* Changed from Smile to VibeIcon */}
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground font-mono">
             {currentMoodName} Stream
            </h1>
        </div>
        <p className="text-md md:text-lg text-muted-foreground">
          Content curated for your '{currentMoodName.toLowerCase()}' mood.
        </p>
      </header>
      
      {filteredPosts.length > 0 ? (
        <div className="space-y-4 md:space-y-5">
          {filteredPosts.map(post => (
            <MoodStreamPostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <Card className="text-center py-12 shadow-none sm:shadow-lg">
            <CardContent className="p-4 sm:p-6">
                <VibeIcon className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground opacity-50 mb-4 sm:mb-6" /> {/* Changed from Smile to VibeIcon */}
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2">No posts for '{currentMoodName}' yet!</h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                    Try tuning to a different mood or check back later.
                </p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}

