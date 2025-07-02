
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, Users, Zap, Rss } from "lucide-react";
import Image from "next/image";
import Link from 'next/link';
import { getTribes } from "@/lib/data-access/tribes";
import { getMoodStreamPosts } from "@/lib/services/post-service";
import { MOCK_CURRENT_USER_ID } from "@/lib/data";
import { formatDistanceToNow } from 'date-fns';

// A simple function to get a user's tribes based on mock data logic
// In a real app, this would be part of a user service: `getUserTribes(userId)`
const getMyTribeIds = () => {
  const baseTribeMemberships = ['1', '3', '6', '7'];
  // In a real app, you wouldn't use localStorage on the server.
  // This is a stand-in for a database call to get user's tribes.
  // We are omitting the localStorage part here for server-side rendering.
  const myTribeIds = [...new Set(baseTribeMemberships)];
  return myTribeIds;
};

// A simplified version to get some recent activity for the dashboard
async function getDashboardActivity(myTribeIds: string[]) {
    const allPosts = await getMoodStreamPosts(); // Using mood stream as a proxy for all posts
    const recentActivity = allPosts
        .filter(post => myTribeIds.includes(post.tribeName ? getTribeIdByName(post.tribeName) : ''))
        .slice(0, 3) // Get the 3 most recent posts from user's tribes
        .map(post => ({
            user: post.author,
            tribe: post.tribeName || 'Unknown Tribe',
            action: post.title ? `posted: "${post.title}"` : 'shared a post',
            time: formatDistanceToNow(post.timestamp, { addSuffix: true }),
        }));
    return recentActivity;
}

// Helper to map tribe name back to ID for filtering, as our mock data is inconsistent
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
}


export default async function DashboardPage() {
  const myTribeIds = getMyTribeIds();
  const allTribes = await getTribes();
  const myTribes = allTribes.filter(t => myTribeIds.includes(t.id));
  
  const allMoodPosts = await getMoodStreamPosts();
  const recentMoodPostsCount = allMoodPosts.filter(
    p => (new Date().getTime() - p.timestamp.getTime()) < (7 * 24 * 60 * 60 * 1000) // last 7 days
  ).length;

  const recentActivity = await getDashboardActivity(myTribeIds);

  return (
    <div className="space-y-8">
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
