
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquareText, Users, User, HeartHandshake, Rss } from "lucide-react";
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { moodsData as allMoods } from '../moods/page'; 
import { allMoodStreamPosts as globalMoodPosts } from '../moods/[moodSlug]/page'; 

interface CommunicationItem {
  id: string;
  type: "family-bond" | "regular-bond" | "mood-stream";
  sender?: string; 
  bondName?: string; 
  tribeName?: string; 
  message?: string; 
  content?: string; 
  moodSlug?: string; 
  moodName?: string; 
  avatarSrc?: string;
  avatarFallback?: string;
  timestamp: Date;
  dataAiHint?: string; 
  imageUrl?: string; 
  imageAlt?: string; 
  dataAiHintImage?: string; 
}

const familyBondMessages: CommunicationItem[] = [
  { id: "fb1", type: "family-bond", sender: "Mom", bondName: "Family Link", message: "Don't forget dinner on Sunday! Bringing your favorite pie. 🥧", avatarSrc: "https://placehold.co/40x40.png?text=M", avatarFallback: "M", timestamp: new Date(Date.now() - 3600000 * 1), dataAiHint: "mother family" },
  { 
    id: "fb3", 
    type: "family-bond", 
    sender: "Dad", 
    bondName: "Family Link", 
    message: "Check out this photo from our fishing trip last weekend!", 
    imageUrl: "https://placehold.co/600x400.png", 
    imageAlt: "Fishing trip photo", 
    avatarSrc: "https://placehold.co/40x40.png?text=D", 
    avatarFallback: "D", 
    timestamp: new Date(Date.now() - 3600000 * 8), 
    dataAiHint: "father family",
    dataAiHintImage: "fishing nature"
  },
  { id: "fb2", type: "family-bond", sender: "Alex (Best Friend)", bondName: "Closest Allies", message: "Hey, are we still on for the game night this Friday? Got the new board game!", avatarSrc: "https://placehold.co/40x40.png?text=A", avatarFallback: "A", timestamp: new Date(Date.now() - 3600000 * 10), dataAiHint: "friend person" },
];

const regularBondMessages: CommunicationItem[] = [
  { id: "rb1", type: "regular-bond", sender: "Work Group Chat", bondName: "Project Phoenix", message: "Reminder: Project Phoenix sprint review at 2 PM today.", avatarSrc: "https://placehold.co/40x40.png?text=PG", avatarFallback: "PG", timestamp: new Date(Date.now() - 3600000 * 2), dataAiHint: "work group" },
  { 
    id: "rb3", 
    type: "regular-bond", 
    sender: "Travel Buddies Tribe", 
    bondName: "Adventure Seekers", 
    message: "Just booked flights for the Bali trip! Who's in for a villa?",
    imageUrl: "https://placehold.co/600x350.png",
    imageAlt: "Bali beach",
    avatarSrc: "https://placehold.co/40x40.png?text=TB", 
    avatarFallback: "TB", 
    timestamp: new Date(Date.now() - 3600000 * 20), 
    dataAiHint: "travel group",
    dataAiHintImage: "beach travel"
  },
  { id: "rb2", type: "regular-bond", sender: "Sarah (Tech Meetup)", bondName: "Tech Connects", message: "Great talk last night! Here's the link to the slides I mentioned.", avatarSrc: "https://placehold.co/40x40.png?text=S", avatarFallback: "S", timestamp: new Date(Date.now() - 3600000 * 25), dataAiHint: "colleague professional" },
];

const moodStreamItems: CommunicationItem[] = globalMoodPosts.map(post => {
  const primaryMoodSlug = post.moodTags[0];
  const moodDetails = allMoods.find(m => m.slug === primaryMoodSlug);

  return {
    id: post.id,
    type: "mood-stream",
    tribeName: post.tribeName,
    content: post.content,
    moodSlug: primaryMoodSlug,
    moodName: moodDetails?.name || primaryMoodSlug,
    avatarSrc: post.authorAvatarSrc,
    avatarFallback: post.authorAvatarFallback || post.author?.substring(0,2),
    timestamp: post.timestamp,
    dataAiHint: post.dataAiHintAvatar,
    imageUrl: post.imageUrl,
    imageAlt: post.imageAlt,
    dataAiHintImage: post.dataAiHintImage,
    sender: post.author,
  };
});


const allComms = [...familyBondMessages, ...regularBondMessages, ...moodStreamItems].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

const YourCommsItem: React.FC<{ item: CommunicationItem }> = ({ item }) => {
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
      if (interval < 7) return `${interval}d ago`;
      if (interval < 30) return `${Math.floor(interval/7)}w ago`;

      interval = Math.floor(seconds / 2592000); 
      if (interval < 12) return `${interval}mo ago`;
      
      interval = Math.floor(seconds / 31536000); 
      return `${interval}y ago`;
    };

    setDisplayTime(timeSince(item.timestamp));
  }, [item.timestamp]);

  let icon = <MessageSquareText className="h-5 w-5 text-primary" />;
  let title = "";
  let subtitle = "";
  let body = "";

  if (item.type === "family-bond" || item.type === "regular-bond") {
    icon = item.type === "family-bond" 
      ? <HeartHandshake className="h-5 w-5 text-pink-500" /> 
      : <User className="h-5 w-5 text-foreground" />;
    title = item.sender || "Unknown Sender";
    subtitle = `via ${item.bondName || "Direct Message"}`;
    body = item.message || "";
  } else if (item.type === "mood-stream") {
    icon = <Rss className="h-5 w-5 text-accent" />;
    title = `New in ${item.moodName || "Mood"} Stream`;
    subtitle = `from ${item.sender || item.tribeName || "Unknown Tribe"}`;
    body = item.content || "";
  }

  return (
    <Card className="shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200 overflow-hidden">
      <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10 border">
            {item.avatarSrc && <AvatarImage src={item.avatarSrc} alt={item.sender || item.tribeName || "Avatar"} data-ai-hint={item.dataAiHint || "avatar"} />}
            <AvatarFallback>{item.avatarFallback || "N/A"}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold tracking-normal">{title}</CardTitle>
              <span className="text-xs text-muted-foreground whitespace-nowrap">{displayTime}</span>
            </div>
            <CardDescription className="text-xs">{subtitle}</CardDescription>
          </div>
           <div className="ml-auto pl-2 text-muted-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent className="p-3 sm:p-4 pt-2 sm:pt-3">
        {item.imageUrl && (
          <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-md">
            <Image 
              src={item.imageUrl} 
              alt={item.imageAlt || "Communication media"} 
              fill
              style={{ objectFit: 'cover' }}
              data-ai-hint={item.dataAiHintImage || "media content"}
            />
          </div>
        )}
        {body && <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{body}</p>}
      </CardContent>
    </Card>
  );
};


export default function YourCommsPage() {
  const [selectedMoodSlug, setSelectedMoodSlug] = useState<string>(allMoods[0]?.slug || "");

  const familyComms = allComms.filter(c => c.type === 'family-bond');
  const regularComms = allComms.filter(c => c.type === 'regular-bond');
  
  const filteredMoodItems = useMemo(() => {
    return allComms.filter(c => c.type === 'mood-stream' && c.moodSlug === selectedMoodSlug);
  }, [selectedMoodSlug]);


  return (
    <div className="space-y-6 md:space-y-8">
      <header className="mb-4 md:mb-6"> 
        <h1 className="text-3xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Intercom</h1>
        <p className="text-md md:text-lg text-muted-foreground mt-1 md:mt-2">
          Catch up on messages from your bonds and the latest in your mood streams.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {familyComms.length > 0 && (
          <section>
            <h2 className="text-xl md:text-2xl font-semibold text-foreground mt-6 mb-3 flex items-center tracking-normal">
              <HeartHandshake className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6 text-pink-500" /> Family Bond Updates
            </h2>
            <div className="space-y-4">
              {familyComms.map(item => <YourCommsItem key={item.id} item={item} />)}
            </div>
          </section>
        )}


        {regularComms.length > 0 && (
          <section>
            <h2 className="text-xl md:text-2xl font-semibold text-foreground mt-6 mb-3 flex items-center tracking-normal">
              <Users className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6 text-primary" /> Your Bonds
            </h2>
            <div className="space-y-4">
              {regularComms.map(item => <YourCommsItem key={item.id} item={item} />)}
            </div>
          </section>
        )}

        
        <section>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-6 mb-3 gap-2">
                <h2 className="text-xl md:text-2xl font-semibold text-foreground flex items-center tracking-normal">
                <Rss className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6 text-accent" /> Mood Stream
                </h2>
                <div className="w-full sm:w-auto sm:min-w-[200px]">
                <Select value={selectedMoodSlug} onValueChange={setSelectedMoodSlug}>
                    <SelectTrigger className="w-full text-base">
                    <SelectValue placeholder="Tune your mood..." />
                    </SelectTrigger>
                    <SelectContent>
                    {allMoods.map(mood => (
                        <SelectItem key={mood.slug} value={mood.slug} className="text-base">
                        <span className="mr-2">{mood.emoji}</span>{mood.name}
                        </SelectItem>
                    ))}
                    </SelectContent>
                </Select>
                </div>
            </div>
            {filteredMoodItems.length > 0 ? (
                <div className="space-y-4">
                {filteredMoodItems.slice(0, 5).map(item => <YourCommsItem key={item.id} item={item} />)}
                </div>
            ) : (
                 <Card className="text-center py-8 shadow-none border border-dashed">
                    <CardContent className="p-4">
                        <Rss className="mx-auto h-10 w-10 text-muted-foreground opacity-60 mb-3" />
                        <p className="text-muted-foreground">No posts for this mood yet.</p>
                        <p className="text-xs text-muted-foreground">Try tuning to a different mood!</p>
                    </CardContent>
                </Card>
            )}
            <CardFooter className="pt-6 justify-center">
                <Link href="/moods" passHref>
                    <Button variant="link">Explore All Mood Streams</Button>
                </Link>
            </CardFooter>
        </section>
        
        {allComms.length === 0 && ( 
            <Card className="text-center py-12 shadow-none sm:shadow-lg">
                <CardContent className="p-4 sm:p-6">
                    <MessageSquareText className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground opacity-50 mb-4 sm:mb-6" />
                    <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 tracking-normal">It's quiet in here...</h3>
                    <p className="text-muted-foreground text-sm sm:text-base">
                        Your communications feed is empty. Connect with friends, join tribes, or explore mood streams to get started!
                    </p>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}

