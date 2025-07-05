
"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Users, Zap, Rss, Loader2, Sparkles, ArrowRight, CheckCircle } from "lucide-react";
import Image from "next/image";
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

import { getTribes } from "@/lib/data-access/tribes";
import { getMoodStreamPosts } from "@/lib/services/post-service";
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';
import { graduateUserFromOnboarding } from '@/lib/services/user-service';

import type { Tribe } from '@/lib/data';
import type { MoodStreamPost } from '@/lib/types';


// Helper functions, moved from the original server component
const getMyTribeIds = () => {
  const baseTribeMemberships = ['1', '3', '6', '7'];
  if (typeof window !== 'undefined') {
    const createdTribeIds: string[] = JSON.parse(localStorage.getItem('myCreatedTribeIds') || '[]');
    return [...new Set([...baseTribeMemberships, ...createdTribeIds])];
  }
  return [...new Set(baseTribeMemberships)];
};

const getTribeIdByName = (name: string): string => {
    const tribeMap: Record<string, string> = {
        "AI Innovators": "1",
        "Weekend Hikers Club": "2",
        "Indie Game Devs": "3",
        "The Local Gig Circuit": "7",
        "Artisan Alley Collective": "8",
        "Sustainable Living Hub": "5",
    };
    return tribeMap[name] || '';
};

async function getDashboardActivity(myTribeIds: string[]) {
    const allPosts = await getMoodStreamPosts();
    return allPosts
        .filter(post => myTribeIds.includes(post.tribeName ? getTribeIdByName(post.tribeName) : ''))
        .slice(0, 3)
        .map(post => ({
            user: post.author,
            tribe: post.tribeName || 'Unknown Tribe',
            action: post.title ? `posted: "${post.title}"` : 'shared a post',
            time: formatDistanceToNow(new Date(post.timestamp), { addSuffix: true }),
        }));
}

interface ActivityItem {
    user: string;
    tribe: string;
    action: string;
    time: string;
}

export default function DashboardPage() {
  const { user } = useUser();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(user.reputationStatus === 'Onboarding');

  const [myTribes, setMyTribes] = useState<Tribe[]>([]);
  const [recentMoodPostsCount, setRecentMoodPostsCount] = useState(0);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      
      const myTribeIds = getMyTribeIds();
      const allTribes = await getTribes();
      const userTribes = allTribes.filter(t => myTribeIds.includes(t.id));
      setMyTribes(userTribes);

      const allMoodPosts = await getMoodStreamPosts();
      const recentPostsCount = allMoodPosts.filter(
        p => (new Date().getTime() - new Date(p.timestamp).getTime()) < (7 * 24 * 60 * 60 * 1000)
      ).length;
      setRecentMoodPostsCount(recentPostsCount);

      const activityData = await getDashboardActivity(myTribeIds);
      setRecentActivity(activityData);
      
      setIsLoading(false);
    };

    fetchData();
  }, []);
  
  const handleCompleteOnboarding = async () => {
      await graduateUserFromOnboarding(user.id);
      toast({
          title: "Onboarding Complete!",
          description: "Your reputation has been established. You can now join more tribes.",
      });
      setShowOnboarding(false);
  };
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {showOnboarding && (
        <Card className="mb-6 shadow-lg border-primary/50 bg-primary/5">
            <CardHeader>
                <div className="flex items-center space-x-3">
                    <Sparkles className="h-8 w-8 text-primary"/>
                    <div>
                        <CardTitle className="text-xl tracking-normal">Welcome to Tribes.app!</CardTitle>
                        <CardDescription>Complete your first step to build your reputation.</CardDescription>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <p className="text-sm text-muted-foreground">
                    Our community is built on trust and constructive engagement. A great way to start is by exploring a curated topic in our "Our Story" section. Reading different perspectives is the first step to meaningful contribution.
                </p>
            </CardContent>
            <CardFooter className="flex-col sm:flex-row items-start sm:items-center gap-4">
                <Link href="/our-story" passHref>
                    <Button variant="outline">Explore 'Our Story' <ArrowRight className="ml-2 h-4 w-4" /></Button>
                </Link>
                <Button onClick={handleCompleteOnboarding}>Mark as Complete</Button>
            </CardFooter>
        </Card>
      )}
      
      <header className="mb-8">
        <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Welcome to Tribes.app</h1>
        <p className="text-lg text-muted-foreground mt-2">
          Connect, communicate, and build with your communities.
        </p>
      </header>

      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Active Tribes</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{myTribes.length}</div>
            <p className="text-xs text-muted-foreground">
              tribes you are a member of
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mood Stream Activity</CardTitle>
            <Rss className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{recentMoodPostsCount} New Posts</div>
            <p className="text-xs text-muted-foreground">
              in the last 7 days
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-lg hover:shadow-xl transition-shadow md:col-span-2 lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Your Intercom</CardTitle>
            <Zap className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3 Unread Messages</div>
            <p className="text-xs text-muted-foreground">
              from your direct bonds
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Recent Activity In Your Tribes</CardTitle>
            <CardDescription>An overview of recent happenings in your communities.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {recentActivity.length > 0 ? recentActivity.map((item, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-secondary/50 rounded-md">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    <span className="font-semibold">{item.user}</span> in <span className="text-primary">{item.tribe}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{item.action} - <span className="italic">{item.time}</span></p>
                </div>
              </div>
            )) : (
              <p className="text-center text-muted-foreground py-4">No recent activity in your tribes.</p>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="grid md:grid-cols-2 gap-6 items-center">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Discover New Tribes</CardTitle>
            <CardDescription>Expand your network and find new communities.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-4">
              Explore tribes based on your interests or create your own to bring people together.
            </p>
            <Link href="/tribes" passHref>
                <Button variant="default" className="bg-primary hover:bg-primary/90">Explore Tribes</Button>
            </Link>
          </CardContent>
        </Card>
         <div className="rounded-lg overflow-hidden shadow-lg">
            <Image 
                src="https://placehold.co/600x400.png" 
                alt="Community placeholder image"
                width={600} 
                height={400} 
                className="object-cover w-full h-full"
                data-ai-hint="community connection" 
            />
        </div>
      </section>
    </div>
  );
}
