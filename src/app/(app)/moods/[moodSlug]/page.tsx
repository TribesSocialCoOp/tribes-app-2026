
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquareText, Smile, Filter as FilterIcon, Settings2, Loader2 } from 'lucide-react';
import { moodsData } from '../page'; 
import { cn } from '@/lib/utils';
import type { MoodStreamPost } from '@/lib/types';
import { getMoodStreamPosts } from '@/lib/services/post-service';

const MoodStreamPostCard: React.FC<{ post: MoodStreamPost }> = ({ post }) => {
  const [displayTime, setDisplayTime] = useState<string>(' ');
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const emoticons = ["👍", "❤️", "😂", "🤔", "😢", "😠"];

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
    setSelectedVibe(vibe);
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
            <CardTitle className="text-sm font-semibold leading-tight tracking-normal">
                {post.author} {post.tribeName && <span className="text-xs text-muted-foreground font-normal">in {post.tribeName}</span>}
            </CardTitle>
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
                  {selectedVibe ? (
                    <span className="text-lg mr-1.5">{selectedVibe}</span>
                  ) : (
                    <Smile className="mr-1.5 h-4 w-4" />
                  )}
                  {post.vibes}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2">
                <div className="flex space-x-1">
                  {emoticons.map((emo) => (
                    <Button 
                      key={emo} 
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
  const moodSlugFromUrl = params.moodSlug as string;

  const [allPosts, setAllPosts] = useState<MoodStreamPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMoodSlugs, setSelectedMoodSlugs] = useState<string[]>(moodSlugFromUrl ? [moodSlugFromUrl] : []);

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        const posts = await getMoodStreamPosts();
        setAllPosts(posts);
        setIsLoading(false);
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (moodSlugFromUrl && (selectedMoodSlugs.length !== 1 || selectedMoodSlugs[0] !== moodSlugFromUrl)) {
      setSelectedMoodSlugs([moodSlugFromUrl]);
    }
  }, [moodSlugFromUrl, selectedMoodSlugs]);

  const filteredPosts = useMemo(() => {
    if (selectedMoodSlugs.length === 0) return [];
    return allPosts.filter(post => 
        selectedMoodSlugs.some(slug => post.moodTags.includes(slug))
      )
      .sort((a,b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [selectedMoodSlugs, allPosts]);

  
  const getHeaderInfo = () => {
    if (selectedMoodSlugs.length === 1) {
      const mood = moodsData.find(m => m.slug === selectedMoodSlugs[0]);
      return {
        title: mood ? `${mood.name} Stream` : "Mood Stream",
        Icon: mood?.icon || Smile,
        description: mood ? `Content curated for your '${mood.name.toLowerCase()}' mood.` : "Tune your mood to discover content."
      };
    } else if (selectedMoodSlugs.length > 1) {
      return {
        title: "Custom Mood Stream",
        Icon: Smile,
        description: `Content from ${selectedMoodSlugs.length} selected moods.`
      };
    }
    return {
      title: "Select Moods",
      Icon: Smile,
      description: "Tune your feed by selecting moods below."
    };
  };

  const { title: headerTitle, Icon: HeaderIcon, description: headerDescription } = getHeaderInfo();

  return (
    <div className="space-y-4 md:space-y-6 relative">
      <header className="mb-4 md:mb-6 pt-4"> 
        <div className="flex items-center space-x-2 mb-1">
            <HeaderIcon className="h-7 w-7 md:h-8 md:w-8 text-primary" /> 
            <h1 className="text-2xl md:text-3xl font-bold tracking-normal text-foreground font-mono">
             {headerTitle}
            </h1>
        </div>
        <p className="text-md md:text-lg text-muted-foreground">
          {headerDescription}
        </p>
      </header>
      
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : filteredPosts.length > 0 ? (
        <div className="space-y-4 md:space-y-5">
          {filteredPosts.map(post => (
            <MoodStreamPostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <Card className="text-center py-12 shadow-none sm:shadow-lg">
            <CardContent className="p-4 sm:p-6">
                <HeaderIcon className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground opacity-50 mb-4 sm:mb-6" /> 
                <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 tracking-normal">
                    {selectedMoodSlugs.length > 0 ? "No posts for your selected moods yet!" : "No moods selected!"}
                </h3>
                <p className="text-muted-foreground text-sm sm:text-base">
                    {selectedMoodSlugs.length > 0 ? "Try different mood combinations or check back later." : "Open the tuner above to select moods and discover content."}
                </p>
            </CardContent>
        </Card>
      )}
    </div>
  );
}
