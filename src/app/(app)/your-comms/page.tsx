
"use client";

import React, { useState, useEffect } from 'react'; // Added useState, useEffect
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MessageSquareText, Zap, Users, User, HeartHandshake, Rss } from "lucide-react";
import Image from 'next/image';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

interface CommunicationItem {
  id: string;
  type: "family-bond" | "regular-bond" | "mood-stream";
  sender?: string; // For bond messages
  bondName?: string; // For bond messages
  tribeName?: string; // For mood stream
  message?: string; // For bond messages
  content?: string; // For mood stream
  mood?: string; // For mood stream
  avatarSrc?: string;
  avatarFallback?: string;
  timestamp: Date;
  dataAiHint?: string;
}

// Mock Data
const familyBondMessages: CommunicationItem[] = [
  { id: "fb1", type: "family-bond", sender: "Mom", bondName: "Family Link", message: "Don't forget dinner on Sunday! Bringing your favorite pie. 🥧", avatarSrc: "https://placehold.co/40x40.png?text=M", avatarFallback: "M", timestamp: new Date(Date.now() - 3600000 * 1), dataAiHint: "mother family" },
  { id: "fb2", type: "family-bond", sender: "Alex (Best Friend)", bondName: "Closest Allies", message: "Hey, are we still on for the game night this Friday? Got the new board game!", avatarSrc: "https://placehold.co/40x40.png?text=A", avatarFallback: "A", timestamp: new Date(Date.now() - 3600000 * 3), dataAiHint: "friend person" },
];

const regularBondMessages: CommunicationItem[] = [
  { id: "rb1", type: "regular-bond", sender: "Work Group Chat", bondName: "Project Phoenix", message: "Reminder: Project Phoenix sprint review at 2 PM today.", avatarSrc: "https://placehold.co/40x40.png?text=PG", avatarFallback: "PG", timestamp: new Date(Date.now() - 3600000 * 2), dataAiHint: "work group" },
  { id: "rb2", type: "regular-bond", sender: "Sarah (Tech Meetup)", bondName: "Tech Connects", message: "Great talk last night! Here's the link to the slides I mentioned.", avatarSrc: "https://placehold.co/40x40.png?text=S", avatarFallback: "S", timestamp: new Date(Date.now() - 3600000 * 5), dataAiHint: "colleague professional" },
];

const moodStreamItems: CommunicationItem[] = [
  { id: "ms1", type: "mood-stream", tribeName: "Creative Corner", mood: "Inspired", content: "Just finished this new digital painting, what do you all think? #ArtOfTheDay", avatarSrc: "https://placehold.co/40x40.png?text=CC", avatarFallback: "CC", timestamp: new Date(Date.now() - 3600000 * 0.5), dataAiHint: "art design" },
  { id: "ms2", type: "mood-stream", tribeName: "Weekend Warriors", mood: "Adventurous", content: "Epic hike to the summit today! Check out this view. ⛰️", avatarSrc: "https://placehold.co/40x40.png?text=WW", avatarFallback: "WW", timestamp: new Date(Date.now() - 3600000 * 4), dataAiHint: "nature travel" },
  { id: "ms3", type: "mood-stream", tribeName: "Chill Zone", mood: "Relaxed", content: "Found this lofi playlist, perfect for unwinding. Highly recommend!", avatarSrc: "https://placehold.co/40x40.png?text=CZ", avatarFallback: "CZ", timestamp: new Date(Date.now() - 3600000 * 6), dataAiHint: "music calm" },
];

const allComms = [...familyBondMessages, ...regularBondMessages, ...moodStreamItems].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

const YourCommsItem: React.FC<{ item: CommunicationItem }> = ({ item }) => {
  const [displayTime, setDisplayTime] = useState<string>(' '); // Initial placeholder

  useEffect(() => {
    const timeSince = (date: Date): string => {
      const now = new Date(); // Get current time on client
      const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
      
      if (seconds < 5) return "just now";
      if (seconds < 60) return `${Math.floor(seconds)}s ago`;
      
      let interval = Math.floor(seconds / 60); // minutes
      if (interval < 60) return `${interval}m ago`;
      
      interval = Math.floor(seconds / 3600); // hours
      if (interval < 24) return `${interval}h ago`;
      
      interval = Math.floor(seconds / 86400); // days
      if (interval < 30) return `${interval}d ago`;
      
      interval = Math.floor(seconds / 2592000); // months
      if (interval < 12) return `${interval}mo ago`;
      
      interval = Math.floor(seconds / 31536000); // years
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
    title = `New in ${item.mood} Mood Stream`;
    subtitle = `from ${item.tribeName || "Unknown Tribe"}`;
    body = item.content || "";
  }

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="pb-3">
        <div className="flex items-start space-x-3">
          <Avatar className="h-10 w-10 border">
            {item.avatarSrc && <AvatarImage src={item.avatarSrc} alt={item.sender || item.tribeName} data-ai-hint={item.dataAiHint || "avatar"} />}
            <AvatarFallback>{item.avatarFallback || "N/A"}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex justify-between items-center">
              <CardTitle className="text-base font-semibold">{title}</CardTitle>
              <span className="text-xs text-muted-foreground">{displayTime}</span>
            </div>
            <CardDescription className="text-xs">{subtitle}</CardDescription>
          </div>
           <div className="ml-auto pl-2 text-muted-foreground">{icon}</div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{body}</p>
      </CardContent>
    </Card>
  );
};


export default function YourCommsPage() {
  const familyComms = allComms.filter(c => c.type === 'family-bond');
  const regularComms = allComms.filter(c => c.type === 'regular-bond');
  const moodItems = allComms.filter(c => c.type === 'mood-stream');


  return (
    <div className="space-y-8">
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Your Comms</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Catch up on messages from your bonds and the latest in your mood streams.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6">
        {familyComms.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center">
              <HeartHandshake className="mr-3 h-6 w-6 text-pink-500" /> Family Bond Updates
            </h2>
            <div className="space-y-4">
              {familyComms.map(item => <YourCommsItem key={item.id} item={item} />)}
            </div>
          </section>
        )}

        {familyComms.length > 0 && (regularComms.length > 0 || moodItems.length > 0) && <Separator className="my-6" />}

        {regularComms.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center">
              <Users className="mr-3 h-6 w-6 text-primary" /> Other Bond Updates
            </h2>
            <div className="space-y-4">
              {regularComms.map(item => <YourCommsItem key={item.id} item={item} />)}
            </div>
          </section>
        )}

        {regularComms.length > 0 && moodItems.length > 0 && <Separator className="my-6" />}
        
        {moodItems.length > 0 && (
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4 flex items-center">
              <Rss className="mr-3 h-6 w-6 text-accent" /> Mood Stream Highlights
            </h2>
            <div className="space-y-4">
              {moodItems.slice(0, 5).map(item => <YourCommsItem key={item.id} item={item} />)}
            </div>
             {moodItems.length > 5 && (
                <CardFooter className="pt-6 justify-center">
                    <Button variant="link">View all Mood Stream activity</Button>
                </CardFooter>
            )}
          </section>
        )}
        
        {allComms.length === 0 && (
            <Card className="text-center py-12 shadow-lg">
                <CardContent>
                    <MessageSquareText className="mx-auto h-16 w-16 text-muted-foreground opacity-50 mb-6" />
                    <h3 className="text-xl font-semibold text-foreground mb-2">It's quiet in here...</h3>
                    <p className="text-muted-foreground">
                        Your communications feed is empty. Connect with friends, join tribes, or explore mood streams to get started!
                    </p>
                </CardContent>
            </Card>
        )}
      </div>
    </div>
  );
}

    