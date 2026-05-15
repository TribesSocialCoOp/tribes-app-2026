"use client";

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Search, ArrowRight, Map, Building, Globe, History, Loader2 } from "lucide-react";
import { cn } from '@/lib/utils';
import { getStoryTopics } from '@/lib/actions/content-actions';
import type { StoryTopic } from '@/lib/types';


const StoryTopicCard: React.FC<{ story: StoryTopic }> = ({ story }) => {
  const categoryIcon = useMemo(() => {
    switch (story.category) {
      case 'local': return <Map className="h-4 w-4" />;
      case 'national': return <Building className="h-4 w-4" />;
      case 'global': return <Globe className="h-4 w-4" />;
      default: return <BookOpen className="h-4 w-4" />;
    }
  }, [story.category]);

  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow flex flex-col overflow-hidden">
      <Link href={`/our-story/${story.id}`} passHref>
        <>
          {story.coverImage && (
            <div className="relative h-48 w-full">
              <Image
                src={story.coverImage}
                alt={story.title}
                fill
                style={{objectFit:"cover"}}
                data-ai-hint={story.dataAiHintCover || "topic image"}
              />
            </div>
          )}
          {!story.coverImage && (
               <div className="h-48 w-full bg-muted flex items-center justify-center relative">
                  <History className="h-16 w-16 text-muted-foreground opacity-50" />
              </div>
          )}
          <CardHeader className="pb-3">
            <div className="flex items-center space-x-2 mb-1">
              <Badge variant="outline" className="capitalize">
                {categoryIcon} <span className="ml-1.5">{story.category}</span>
              </Badge>
            </div>
            <CardTitle className="text-xl font-semibold tracking-tight line-clamp-2">{story.title}</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow pb-3 space-y-2">
            <CardDescription className="text-sm h-20 overflow-hidden text-ellipsis leading-relaxed line-clamp-4">
              {story.summary}
            </CardDescription>
             {story.curator && (
               <div className="flex items-center space-x-2 pt-2">
                  <Avatar className="h-7 w-7">
                      {story.curatorAvatar && <AvatarImage src={story.curatorAvatar} alt={story.curator} data-ai-hint={story.dataAiHintCuratorAvatar || "avatar person"} />}
                      <AvatarFallback className="text-xs">{story.curatorAvatarFallback || story.curator.substring(0,1)}</AvatarFallback>
                  </Avatar>
                  <p className="text-xs text-muted-foreground">
                      Curated by <span className="font-medium text-foreground">{story.curator}</span>
                  </p>
              </div>
             )}
          </CardContent>
        </>
      </Link>
      <CardFooter className="border-t p-3 flex items-center justify-between">
        <div className="text-xs text-muted-foreground">
          Updated: {format(story.lastUpdatedAt, "MMM d, yyyy")}
        </div>
        <Button variant="default" size="sm" asChild className="bg-primary hover:bg-primary/90">
          <Link href={`/our-story/${story.id}`}>
            View Topic <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
};


export default function OurStoryClient() {
  const [allStoryTopics, setAllStoryTopics] = useState<StoryTopic[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'local' | 'national' | 'global'>('all');

  useEffect(() => {
    const fetchData = async () => {
        setIsLoading(true);
        const topics = await getStoryTopics();
        setAllStoryTopics(topics);
        setIsLoading(false);
    };
    fetchData();
  }, []);

  const filteredStories = useMemo(() => {
    let stories = allStoryTopics;
    if (activeTab !== 'all') {
      stories = stories.filter(story => story.category === activeTab);
    }
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      stories = stories.filter(story =>
        story.title.toLowerCase().includes(lowerSearchTerm) ||
        story.summary.toLowerCase().includes(lowerSearchTerm) ||
        (story.curator && story.curator.toLowerCase().includes(lowerSearchTerm))
      );
    }
    return stories.sort((a, b) => b.lastUpdatedAt.getTime() - a.lastUpdatedAt.getTime());
  }, [searchTerm, activeTab, allStoryTopics]);

  const getCategoryIcon = (category: StoryTopic['category'] | 'all') => {
    switch (category) {
      case 'local': return <Map className="mr-2 h-4 w-4" />;
      case 'national': return <Building className="mr-2 h-4 w-4" />;
      case 'global': return <Globe className="mr-2 h-4 w-4" />;
      case 'all': default: return <BookOpen className="mr-2 h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-8">
      <header className="text-center mb-8">
        <div className="inline-block p-3 bg-primary/10 rounded-full mb-4">
          <BookOpen className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-2xl sm:text-4xl font-bold tracking-normal text-foreground font-mono">Our Story</h1>
        <p className="text-lg text-muted-foreground mt-2 max-w-2xl mx-auto">
          Understand the world together. Explore curated topics, share insights, and engage in constructive discussions.
        </p>
      </header>

      <div className="mb-8 sticky top-2 sm:top-4 z-10 bg-background/90 backdrop-blur-sm py-3 rounded-lg shadow-sm border">
        <div className="container_wrapper px-2 sm:px-4 flex flex-col sm:flex-row items-center gap-4">
          <div className="relative flex-grow w-full sm:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search topics by title, summary, or curator..."
              className="pl-10 py-3 text-base rounded-full shadow-sm w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as typeof activeTab)} className="w-full sm:w-auto">
            <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 h-auto sm:h-10">
              {(['all', 'local', 'national', 'global'] as const).map(tab => (
                <TabsTrigger key={tab} value={tab} className="capitalize px-2 py-1.5 sm:px-3 sm:py-2 text-xs sm:text-sm">
                  {getCategoryIcon(tab)} {tab}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : filteredStories.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredStories.map((story) => (
            <StoryTopicCard key={story.id} story={story} />
          ))}
        </section>
      ) : (
        <Card className="text-center p-8 col-span-full shadow-md">
            <History className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <CardTitle className="tracking-normal text-xl">No Stories Found</CardTitle>
            <CardDescription className="mt-2 mb-4">
                {searchTerm ? "No stories match your search criteria for the " + activeTab + " category." : 
                 activeTab !== 'all' ? "There are no stories in the " + activeTab + " category currently." :
                 "There are no stories available at the moment."}
            </CardDescription>
            {searchTerm && (
                <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
            )}
        </Card>
      )}
    </div>
  );
}
