
"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useState, useEffect }
from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Radio, MessageSquareText, Send, UserCircle } from "lucide-react"; // Using Radio as a placeholder for live icon

// Define an interface for an Event Stream Post
interface EventStreamPost {
  id: string;
  authorNickname: string;
  authorAvatar?: string; // Optional: could be a generic event icon or user-chosen temp avatar
  authorAvatarFallback: string;
  content: string;
  timestamp: Date;
  imageUrl?: string;
  imageAlt?: string;
  dataAiHintAvatar?: string;
  dataAiHintImage?: string;
}

const MOCK_EVENT_STREAM_DATE_MS = new Date("2024-07-25T10:00:00.000Z").getTime();

// Sample event stream posts
const sampleEventPosts: EventStreamPost[] = [
  {
    id: "evp1",
    authorNickname: "EventOrganizer",
    authorAvatarFallback: "EO",
    content: "Welcome to 'Tech Innovators Summit'! We're thrilled to have you. Check the schedule for today's keynote at 10 AM.",
    timestamp: new Date(MOCK_EVENT_STREAM_DATE_MS - 3600000 * 2), // 2 hours ago
    dataAiHintAvatar: "organizer official"
  },
  {
    id: "evp2",
    authorNickname: "AI_Explorer_77",
    authorAvatarFallback: "AI",
    content: "Excited for the AI ethics panel! Anyone know if there will be a Q&A session afterwards?",
    timestamp: new Date(MOCK_EVENT_STREAM_DATE_MS - 3600000 * 1.5), // 1.5 hours ago
    dataAiHintAvatar: "attendee user"
  },
  {
    id: "evp3",
    authorNickname: "EventOrganizer",
    authorAvatarFallback: "EO",
    content: "Quick update: The workshop on 'Next-Gen AI Tools' in Room B is starting in 15 minutes.",
    imageUrl: "https://placehold.co/600x200.png",
    imageAlt: "Workshop reminder banner",
    timestamp: new Date(MOCK_EVENT_STREAM_DATE_MS - 3600000 * 1), // 1 hour ago
    dataAiHintAvatar: "organizer official",
    dataAiHintImage: "event schedule"
  },
  {
    id: "evp4",
    authorNickname: "DevDude_Online",
    authorAvatarFallback: "DD",
    content: "Is anyone else having trouble connecting to the event Wi-Fi? SSID: EventGuest",
    timestamp: new Date(MOCK_EVENT_STREAM_DATE_MS - 3600000 * 0.5), // 30 mins ago
    dataAiHintAvatar: "attendee help"
  },
];

const EventPostCard: React.FC<{ post: EventStreamPost }> = ({ post }) => {
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
      return `${interval}d ago`;
    };
    setDisplayTime(timeSince(post.timestamp));
  }, [post.timestamp]);

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start space-x-3">
          <Avatar className="h-9 w-9">
            {post.authorAvatar && <AvatarImage src={post.authorAvatar} alt={post.authorNickname} data-ai-hint={post.dataAiHintAvatar || "avatar"} />}
            <AvatarFallback>{post.authorAvatarFallback}</AvatarFallback>
          </Avatar>
          <div>
            <p className="text-sm font-semibold text-foreground">{post.authorNickname}</p>
            <p className="text-xs text-muted-foreground">{displayTime}</p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-1">
        {post.imageUrl && (
          <div className="mb-2 relative aspect-video w-full overflow-hidden rounded-md border">
            <Image
              src={post.imageUrl}
              alt={post.imageAlt || "Event stream media"}
              fill
              style={{ objectFit: 'cover' }}
              data-ai-hint={post.dataAiHintImage || "event media"}
            />
          </div>
        )}
        <p className="text-sm text-foreground whitespace-pre-line">{post.content}</p>
      </CardContent>
    </Card>
  );
};


export default function EventStreamPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const eventId = params.eventId as string;
  const [eventName, setEventName] = useState("this Event");
  const [nickname, setNickname] = useState("Guest");
  const [posts, setPosts] = useState<EventStreamPost[]>(sampleEventPosts); // Initialize with sample posts
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    const nameParam = searchParams.get("eventName");
    const nickParam = searchParams.get("nickname");
    if (nameParam) setEventName(nameParam);
    if (nickParam) setNickname(nickParam);
  }, [searchParams]);

  const handlePostMessage = () => {
    if (newMessage.trim() === "") return;
    const newPost: EventStreamPost = {
      id: `evp${Date.now()}`,
      authorNickname: nickname,
      authorAvatarFallback: nickname.substring(0, 2).toUpperCase() || "ME",
      content: newMessage,
      timestamp: new Date(),
      // Add dataAiHintAvatar: "current user event" if desired
    };
    setPosts(prevPosts => [newPost, ...prevPosts]); // Add new post to the top
    setNewMessage("");
  };


  return (
    <>
      <CardHeader className="text-center sticky top-0 z-10 bg-card/95 backdrop-blur-sm pt-4 pb-3 px-4 border-b rounded-t-lg">
        <div className="flex justify-center mb-1">
            <Radio className="h-8 w-8 text-primary animate-pulse" />
        </div>
        <CardTitle className="text-lg md:text-xl font-bold font-mono">
            {eventName} - Live Stream
        </CardTitle>
        <CardDescription className="text-sm text-muted-foreground">
          Interacting as: <span className="font-semibold text-primary">{nickname}</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="p-0 flex-1 flex flex-col"> {/* p-0 to allow ScrollArea to manage padding */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3"> {/* Scrollable feed area */}
          {posts.length > 0 ? (
            posts.map(post => <EventPostCard key={post.id} post={post} />)
          ) : (
            <div className="text-center py-10">
              <MessageSquareText className="h-12 w-12 text-muted-foreground opacity-60 mx-auto mb-3" />
              <p className="text-muted-foreground">No posts in this event stream yet.</p>
              <p className="text-sm text-muted-foreground">Be the first to say something!</p>
            </div>
          )}
        </div>

        {/* Post Input Area */}
        <div className="p-3 border-t bg-card">
          <div className="flex items-center space-x-2">
            <Avatar className="h-9 w-9">
              <AvatarFallback>{nickname.substring(0,2).toUpperCase() || "ME"}</AvatarFallback>
            </Avatar>
            <Input
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 text-sm"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePostMessage();
                }
              }}
            />
            <Button size="icon" onClick={handlePostMessage} disabled={newMessage.trim() === ""}>
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row gap-2 p-3 border-t rounded-b-lg">
        <Button asChild className="w-full sm:flex-1" size="sm" variant="outline">
          <Link href={`/events/${eventId}`}>
            View Full Event Details
          </Link>
        </Button>
        <Button asChild className="w-full sm:flex-1" size="sm">
          <Link href="/your-comms">
            Back to My Intercom
          </Link>
        </Button>
      </CardFooter>
    </>
  );
}

    