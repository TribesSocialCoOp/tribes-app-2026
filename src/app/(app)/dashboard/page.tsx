import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, MessageSquare, Users, Zap } from "lucide-react";
import Image from "next/image";

export default function DashboardPage() {
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
            <CardTitle className="text-sm font-medium">Active Tribes</CardTitle>
            <Users className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">12</div>
            <p className="text-xs text-muted-foreground">
              +2 since last week
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Unread Messages</CardTitle>
            <MessageSquare className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">58</div>
            <p className="text-xs text-muted-foreground">
              in 5 active chats
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-lg hover:shadow-xl transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Mood Stream Activity</CardTitle>
            <Zap className="h-5 w-5 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">3 New Posts</div>
            <p className="text-xs text-muted-foreground">
              in your followed moods
            </p>
          </CardContent>
        </Card>
      </section>

      <section>
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
            <CardDescription>An overview of recent happenings in your tribes.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { user: "Alice", tribe: "Book Club", action: "shared a new review", time: "2h ago" },
              { user: "Bob", tribe: "Gaming Guild", action: "started a new thread: 'Weekend Tournament'", time: "5h ago" },
              { user: "Charlie", tribe: "Coders Connect", action: "uploaded 'project_specs.pdf'", time: "1d ago" },
            ].map((item, index) => (
              <div key={index} className="flex items-center space-x-3 p-3 bg-secondary/50 rounded-md">
                <Activity className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    <span className="font-semibold">{item.user}</span> in <span className="text-primary">{item.tribe}</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{item.action} - <span className="italic">{item.time}</span></p>
                </div>
              </div>
            ))}
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
            <Button variant="default" className="bg-primary hover:bg-primary/90">Explore Tribes</Button>
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
