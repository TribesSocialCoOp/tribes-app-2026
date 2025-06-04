
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { X, MessageSquareText, Settings2, Smile } from 'lucide-react';
import { moodsData } from '../page'; 
import { cn } from '@/lib/utils';

interface MoodStreamPost {
  id: string;
  title?: string; 
  content: string;
  author: string; 
  authorAvatarSrc?: string;
  authorAvatarFallback?: string;
  tribeName?: string; 
  imageUrl?: string; 
  imageAlt?: string; 
  moodTags: string[]; // e.g., ["chill", "relaxing"]
  timestamp: Date;
  vibes?: number; 
  comments?: number;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
}

export const allMoodStreamPosts: MoodStreamPost[] = [
  // Existing Chill
  { id: "msp1", content: "Just found this amazing ambient playlist, perfect for a #chill afternoon. 🎶", author: "MusicLover22", moodTags: ["chill"], timestamp: new Date(Date.now() - 3600000 * 1), vibes: 15, comments: 3, authorAvatarSrc: "https://placehold.co/40x40.png?text=ML", authorAvatarFallback: "ML", dataAiHintAvatar: "music person" },
  { id: "msp7", content: "Sunday morning coffee and a good book. Pure bliss. #chill", author: "ReaderLife", moodTags: ["chill", "learn"], timestamp: new Date(Date.now() - 3600000 * 2), imageUrl: "https://placehold.co/600x450.png", imageAlt: "Coffee and book", dataAiHintImage: "coffee book", dataAiHintAvatar: "reader person", vibes: 22 },
  
  // Existing Focus
  { id: "msp2", title: "My Top 5 Productivity Hacks for Deep Work", content: "Sharing my secrets to staying in the zone! Tip #1: Time blocking is key. #focus", author: "ProductivePro", tribeName: "Focus Finders", moodTags: ["focus", "learn"], timestamp: new Date(Date.now() - 3600000 * 3), vibes: 45, comments: 12, authorAvatarSrc: "https://placehold.co/40x40.png?text=PP", authorAvatarFallback: "PP", dataAiHintAvatar: "work professional" },
  
  // Tuned Create (Showcase/Performance)
  { id: "msp3", title: "Live Painting Session - Downtown Gallery!", content: "Going live with a new canvas at the gallery opening. Come say hi! #create #discover", author: "ArtByLena", moodTags: ["create", "discover"], timestamp: new Date(Date.now() - 3600000 * 5), imageUrl: "https://placehold.co/600x400.png", imageAlt: "Artist live painting", vibes: 72, comments: 8, authorAvatarSrc: "https://placehold.co/40x40.png?text=AL", authorAvatarFallback: "AL", dataAiHintAvatar: "artist live", dataAiHintImage: "painting gallery" },
  { id: "msp8", title: "My Stage Setup for Tonight's Gig", content: "Sound check done! Ready to rock the 'Music Hall' tonight. Who's coming? #create", author: "RockstarDev", tribeName: "The Local Gig Circuit", moodTags: ["create", "discover"], timestamp: new Date(Date.now() - 3600000 * 8), imageUrl: "https://placehold.co/600x380.png", imageAlt: "Stage setup with instruments", dataAiHintImage: "stage music", dataAiHintAvatar: "musician band", vibes: 50 },
  
  // Tuned Discover (Live Events/Local Scenes)
  { id: "msp4", title: "Street Art Tour - City Center", content: "Just discovered some amazing murals on the street art tour. Check out the pics! #discover", author: "UrbanExplorer", moodTags: ["discover", "create"], timestamp: new Date(Date.now() - 3600000 * 10), imageUrl: "https://placehold.co/600x400.png", imageAlt: "Street art mural", dataAiHintImage: "street art graffiti", vibes: 33, comments: 7, authorAvatarSrc: "https://placehold.co/40x40.png?text=UE", authorAvatarFallback: "UE", dataAiHintAvatar: "explorer urban" },
  { id: "msp9", title: "Farmers Market Haul & Community Meetup!", content: "Fresh produce and great chats at today's market. Met some cool folks from the 'Sustainable Living Hub'! #discover #connect", author: "LocalFoodie", moodTags: ["discover", "shop", "connect"], timestamp: new Date(Date.now() - 3600000 * 2), imageUrl: "https://placehold.co/600x420.png", imageAlt: "Farmers market produce", vibes: 28, comments: 5, authorAvatarSrc: "https://placehold.co/40x40.png?text=LF", authorAvatarFallback: "LF", dataAiHintAvatar: "foodie person", dataAiHintImage: "market food" },
  { id: "msp10", title: "Neighborhood Festival This Weekend!", content: "Music, food, and art at the community festival this Saturday. Let's connect! #discover #connect", author: "Community Events", tribeName: "City Volunteers", moodTags: ["discover", "connect"], timestamp: new Date(Date.now() - 3600000 * 24), vibes: 55, comments: 10, dataAiHintAvatar: "community group", imageUrl: "https://placehold.co/600x390.png", dataAiHintImage: "festival event" },

  // New Connect Posts
  { id: "connect1", title: "Post-Show Meetup at The Green Dragon", content: "Great gig tonight! Anyone heading to The Green Dragon for a post-show chat? #connect", author: "BandFanatic", tribeName: "The Local Gig Circuit", moodTags: ["connect", "discover"], timestamp: new Date(Date.now() - 3600000 * 0.5), vibes: 40, comments: 15, authorAvatarSrc: "https://placehold.co/40x40.png?text=BF", authorAvatarFallback: "BF", dataAiHintAvatar: "fan music" },
  { id: "connect2", content: "Planning a collab session for artisan makers next week. DM if interested! #connect #create", author: "CraftyConnector", tribeName: "Artisan Alley Collective", moodTags: ["connect", "create"], timestamp: new Date(Date.now() - 3600000 * 18), vibes: 25, comments: 6, dataAiHintAvatar: "crafter community" },
  { id: "connect3", title: "Poetry Slam Sign-ups Open!", content: "Our next Open Mic Night needs poets! Sign up in the 'Open Mic Night Crew' tribe. #connect #create", author: "PoetryHost", tribeName: "Open Mic Night Crew", moodTags: ["connect", "create", "discover"], timestamp: new Date(Date.now() - 3600000 * 48), imageUrl: "https://placehold.co/600x360.png", imageAlt: "Microphone on stage", dataAiHintImage: "microphone stage", vibes: 30, comments: 9, dataAiHintAvatar: "host event" },

  // Existing Shop
  { id: "msp11", title: "Indie Artist Merch Drop!", content: "Support local artists! New T-shirts and prints available from members of 'Artisan Alley Collective'. Link in bio. #shop #create", author: "ArtCollector", moodTags: ["shop", "create"], timestamp: new Date(Date.now() - 3600000 * 4), vibes: 88, comments: 22, authorAvatarSrc: "https://placehold.co/40x40.png?text=AC", authorAvatarFallback: "AC", dataAiHintAvatar: "collector art" },
  { id: "msp12", content: "Limited edition band tees at the merch stand tonight! #shop #discover", author: "GigMerch", tribeName: "The Local Gig Circuit", moodTags: ["shop", "discover"], timestamp: new Date(Date.now() - 3600000 * 6), imageUrl: "https://placehold.co/600x370.png", imageAlt: "Band t-shirts", vibes: 115, comments: 30, authorAvatarSrc: "https://placehold.co/40x40.png?text=GM", authorAvatarFallback: "GM", dataAiHintAvatar: "merch seller", dataAiHintImage: "tshirt fashion" },
  
  // Existing Learn
  { id: "msp5", title: "Workshop: DIY Screen Printing", content: "Learn how to screen print your own designs! Hosted by 'Artisan Alley Collective' next Saturday. #learn #create", author: "WorkshopGuru", moodTags: ["learn", "create"], timestamp: new Date(Date.now() - 3600000 * 12), imageUrl: "https://placehold.co/600x350.png", imageAlt: "Screen printing workshop", vibes: 102, comments: 25, authorAvatarSrc: "https://placehold.co/40x40.png?text=WG", authorAvatarFallback: "WG", dataAiHintAvatar: "teacher craft", dataAiHintImage: "workshop craft" },
  { id: "new_learn1", title: "Songwriting Masterclass - Notes & Tips", content: "Sharing some insights from the songwriting masterclass I attended. Key takeaway: storytelling is everything! #learn #create", author: "MusicStudent", moodTags: ["learn", "create"], timestamp: new Date(Date.now() - 3600000 * 7), vibes: 67, comments: 11, dataAiHintAvatar: "student music" },
  
  // Existing Game
  { id: "msp6", content: "Just hit a new high score in 'Cyber Runner'! So stoked. #game 🏆", author: "ProGamerX", moodTags: ["game"], timestamp: new Date(Date.now() - 3600000 * 15), vibes: 60, comments: 18, authorAvatarSrc: "https://placehold.co/40x40.png?text=PG", authorAvatarFallback: "PG", dataAiHintAvatar: "gamer person"},
  { id: "new_game1", title: "Upcoming Cozy Game Releases", content: "So many cute and relaxing games are coming out next month! Which ones are you excited for? #game #chill", author: "CozyGamer", moodTags: ["game", "chill"], timestamp: new Date(Date.now() - 3600000 * 9), imageUrl: "https://placehold.co/600x330.png", imageAlt: "Cozy game graphics", dataAiHintImage: "games illustration", dataAiHintAvatar: "gamer girl", vibes: 95, comments: 20 },
];

const MoodStreamPostCard: React.FC<{ post: MoodStreamPost }> = ({ post }) => {
  const [displayTime, setDisplayTime] = useState<string>(' ');
  const currentMood = moodsData.find(m => post.moodTags.includes(m.slug));
  const VibeIcon = currentMood?.icon || (() => <Smile className="h-4 w-4" />); // Fallback to Smile icon
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
            <CardTitle className="text-sm font-semibold leading-tight tracking-normal">{post.author} {post.tribeName && <span className="text-xs text-muted-foreground font-normal">in {post.tribeName}</span>}</CardTitle>
            <CardDescription className="text-xs">{displayTime}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-1 sm:pt-2">
        {post.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-normal">{post.title}</h3>}
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
      {(post.vibes !== undefined || post.comments !== undefined) && (
        <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start space-x-4 border-t">
          {post.vibes !== undefined && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary">
                  <VibeIcon className="mr-1.5 h-4 w-4" /> {post.vibes}
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
  const [currentMoodObject, setCurrentMoodObject] = useState(moodsData.find(m => m.slug === moodSlug) || moodsData[0]);
  const [selectedMoodForTuner, setSelectedMoodForTuner] = useState(moodSlug || moodsData[0].slug);

  const VibeIcon = currentMoodObject.icon || (() => <Smile className="h-7 w-7 md:h-8 md:w-8 text-primary" />);


  useEffect(() => {
    const moodObj = moodsData.find(m => m.slug === moodSlug);
    if (moodObj) {
      setCurrentMoodObject(moodObj);
      setSelectedMoodForTuner(moodSlug); 
    } else {
      // Fallback to the first mood if slug is invalid
      router.replace(`/moods/${moodsData[0].slug}`);
    }
  }, [moodSlug, router]);

  const filteredPosts = useMemo(() => {
    if (!moodSlug) return [];
    return allMoodStreamPosts.filter(post => post.moodTags.includes(moodSlug))
      .sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [moodSlug]);

  const handleTuneMood = () => {
    if (selectedMoodForTuner && selectedMoodForTuner !== moodSlug) {
      router.push(`/moods/${selectedMoodForTuner}`);
    }
  };
  
  const CurrentMoodIcon = currentMoodObject.icon || (() => null);


  return (
    <div className="space-y-4 md:space-y-6 relative">
      {isTunerVisible && (
        <Card className="sticky top-2 sm:top-4 left-0 right-0 z-10 shadow-xl bg-background/90 backdrop-blur-sm border">
          <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3 flex flex-row items-center justify-between">
            <div className='flex items-center'>
              <Settings2 className="h-5 w-5 mr-2 text-primary" />
              <CardTitle className="text-md sm:text-lg font-semibold tracking-normal">Tune Your Mood</CardTitle>
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

      <header className={cn("mb-4 md:mb-6", isTunerVisible && "pt-4")}> 
        <div className="flex items-center space-x-2 mb-1">
            <CurrentMoodIcon className="h-7 w-7 md:h-8 md:w-8 text-primary" /> 
            <h1 className="text-2xl md:text-3xl font-bold tracking-normal text-foreground font-mono">
             {currentMoodObject.name} Stream
            </h1>
        </div>
        <p className="text-md md:text-lg text-muted-foreground">
          Content curated for your '{currentMoodObject.name.toLowerCase()}' mood.
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
                <CurrentMoodIcon className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground opacity-50 mb-4 sm:mb-6" /> 
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 tracking-normal">No posts for '{currentMoodObject.name}' yet!</h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                    Try tuning to a different mood or check back later.
                </p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}

    