
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MessageSquareText, Users, User, HeartHandshake, Rss, Filter as FilterIcon, PlusCircle, Loader2 } from "lucide-react";
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { moodsData as allMoods } from '../moods/page';
import type { MoodStreamPost, Bond, CommunicationItem } from '@/lib/types';
import { getBonds } from '@/lib/services/bond-service';
import { getMoodStreamPosts } from '@/lib/services/post-service';

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
    title = item.sender || "Unknown";
    subtitle = `in ${item.moodName || "Mood"} Stream ${item.tribeName ? `(from ${item.tribeName})` : ''}`;
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
  const defaultSelectedMoods = ['chill', 'focus', 'showcase', 'discover'];
  const localStorageKey = 'tribesAppSelectedMoods';

  const [isLoading, setIsLoading] = useState(true);
  const [allCommsData, setAllCommsData] = useState<CommunicationItem[]>([]);
  const [selectedMoodSlugs, setSelectedMoodSlugs] = useState<string[]>([]);
  const [isTunerOpen, setIsTunerOpen] = useState(false);
  const [hasLoadedFromStorage, setHasLoadedFromStorage] = useState(false);

  useEffect(() => {
    // This effect runs once to load initial filter state from localStorage
    const storedMoods = localStorage.getItem(localStorageKey);
    if (storedMoods) {
      try {
        const parsedMoods = JSON.parse(storedMoods);
        if (Array.isArray(parsedMoods) && parsedMoods.every(slug => typeof slug === 'string')) {
          setSelectedMoodSlugs(parsedMoods);
        } else {
          setSelectedMoodSlugs(defaultSelectedMoods);
        }
      } catch (e) {
        setSelectedMoodSlugs(defaultSelectedMoods);
      }
    } else {
      setSelectedMoodSlugs(defaultSelectedMoods);
    }
    setHasLoadedFromStorage(true);
  }, []);

  useEffect(() => {
    // This effect saves filter state to localStorage whenever it changes
    if (hasLoadedFromStorage) {
      localStorage.setItem(localStorageKey, JSON.stringify(selectedMoodSlugs));
    }
  }, [selectedMoodSlugs, hasLoadedFromStorage]);
  
  useEffect(() => {
    const fetchAllData = async () => {
        setIsLoading(true);
        // Fetch all data sources in parallel
        const [bonds, moodPosts] = await Promise.all([getBonds(), getMoodStreamPosts()]);

        // Transform fetched data into a unified CommunicationItem format
        // This logic is a placeholder for real message fetching from bonds
        const bondMessages: CommunicationItem[] = bonds
            .filter(b => b.bondType === 'family' || b.bondType === 'friend')
            .map(b => ({
                id: `bond-msg-${b.id}`,
                type: b.bondType === 'family' ? 'family-bond' : 'regular-bond',
                sender: b.targetName,
                bondName: b.targetName,
                message: `This is a placeholder message from your bond with ${b.targetName}.`,
                timestamp: b.lastRefreshedAt, // Using lastRefreshedAt as a mock timestamp
                avatarFallback: b.targetName.substring(0, 2),
            }));

        const moodStreamItems: CommunicationItem[] = moodPosts.map(post => {
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

        const combinedData = [...bondMessages, ...moodStreamItems].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        setAllCommsData(combinedData);
        setIsLoading(false);
    };

    fetchAllData();
  }, []);


  const handleMoodSelectionChange = (moodSlug: string, checked: boolean | "indeterminate") => {
    setSelectedMoodSlugs(prev =>
      checked ? [...prev, moodSlug] : prev.filter(slug => slug !== moodSlug)
    );
  };

  const familyComms = useMemo(() => allCommsData.filter(c => c.type === 'family-bond'), [allCommsData]);
  const regularComms = useMemo(() => allCommsData.filter(c => c.type === 'regular-bond'), [allCommsData]);

  const highlightsFromYourMoods = useMemo(() => {
    if (selectedMoodSlugs.length === 0 && hasLoadedFromStorage) return [];
    const slugsToFilter = selectedMoodSlugs.length > 0 ? selectedMoodSlugs : (hasLoadedFromStorage ? [] : defaultSelectedMoods); 
    
    return allCommsData
      .filter(c => c.type === 'mood-stream' && c.moodSlug && slugsToFilter.includes(c.moodSlug))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }, [selectedMoodSlugs, hasLoadedFromStorage, allCommsData]);


  return (
    <div className="space-y-6 md:space-y-8">
      <header className="mb-4 md:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Intercom</h1>
          <p className="text-md md:text-lg text-muted-foreground mt-1 md:mt-2">
            Catch up on messages from your bonds and the latest in your mood streams.
          </p>
        </div>
        <Popover open={isTunerOpen} onOpenChange={setIsTunerOpen}>
            <PopoverTrigger asChild>
                <Button variant="outline">
                    <FilterIcon className="mr-2 h-4 w-4" /> Tune Feed
                </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-0 max-h-[75vh] flex flex-col">
                <div className="p-4 border-b">
                    <h4 className="font-medium leading-none text-sm">Tune Your Intercom</h4>
                    <p className="text-xs text-muted-foreground mt-1">
                        Select sources to include in your "Highlights" feed.
                    </p>
                </div>
                
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-1">
                        <p className="text-sm font-medium text-foreground mb-2">Filter by Moods:</p>
                        <div className="space-y-2 pl-1">
                            {allMoods.map(mood => (
                                <div key={mood.slug} className="flex items-center space-x-2">
                                    <Checkbox
                                        id={`mood-check-${mood.slug}`}
                                        checked={selectedMoodSlugs.includes(mood.slug)}
                                        onCheckedChange={(checked) => handleMoodSelectionChange(mood.slug, checked)}
                                    />
                                    <Label htmlFor={`mood-check-${mood.slug}`} className="text-sm font-normal cursor-pointer flex items-center">
                                       <span className="mr-1.5 text-base">{mood.emoji}</span> {mood.name}
                                    </Label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <Separator className="my-4" />
                    
                    <div className="space-y-2">
                        <p className="text-sm font-medium text-foreground mb-2">Your Custom Streams:</p>
                        <p className="text-xs text-muted-foreground p-2 text-center bg-muted/50 rounded-md">
                            Soon you'll be able to create and select custom streams combining your favorite tribes and moods!
                        </p>
                        <Button variant="outline" size="sm" className="w-full mt-2" disabled>
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Create New Custom Stream
                        </Button>
                    </div>
                </ScrollArea>
                
                <div className="p-4 border-t">
                    <Button size="sm" onClick={() => setIsTunerOpen(false)} className="w-full">Done</Button>
                </div>
            </PopoverContent>
        </Popover>
      </header>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : (
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
                        <Rss className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6 text-accent" /> Highlights from Your Moods
                    </h2>
                </div>
                {highlightsFromYourMoods.length > 0 ? (
                    <div className="space-y-4">
                    {highlightsFromYourMoods.map(item => <YourCommsItem key={item.id} item={item} />)}
                    </div>
                ) : (
                    <Card className="text-center py-8 shadow-none border border-dashed">
                        <CardContent className="p-4">
                            <Rss className="mx-auto h-10 w-10 text-muted-foreground opacity-60 mb-3" />
                            <p className="text-muted-foreground">
                            {(selectedMoodSlugs.length > 0 || !hasLoadedFromStorage) ? "No posts from your selected moods yet." : "Select some moods to see highlights here!"}
                            </p>
                            {(selectedMoodSlugs.length === 0 && hasLoadedFromStorage) && (
                                <Button variant="link" onClick={() => setIsTunerOpen(true)} className="mt-1">
                                    Tune Your Feed
                                </Button>
                            )}
                        </CardContent>
                    </Card>
                )}
                <CardFooter className="pt-6 justify-center">
                    <Link href="/moods" passHref>
                        <Button variant="link">Explore All Mood Streams</Button>
                    </Link>
                </CardFooter>
            </section>

            {allCommsData.length === 0 && (
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
      )}
    </div>
  );
}
