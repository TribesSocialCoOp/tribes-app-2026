
"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import React, { useState, useEffect, Suspense, useCallback } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Radio, MessageSquareText, Send, Loader2 } from "lucide-react";
import { useTimeSince } from '@/hooks/use-time-since';
import { getEventStreamPosts, createEventStreamPost } from '@/lib/actions/event-actions';

interface StreamPost {
  id: string;
  eventId: string;
  authorNickname: string;
  authorAvatarFallback: string;
  content: string;
  imageUrl?: string;
  imageAlt?: string;
  timestamp: Date;
}

const EventPostCard: React.FC<{ post: StreamPost }> = ({ post }) => {
  const displayTime = useTimeSince(post.timestamp);

  return (
    <Card className="shadow-sm">
      <CardHeader className="p-3 pb-2">
        <div className="flex items-start space-x-3">
          <Avatar className="h-9 w-9">
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={post.imageUrl}
              alt={post.imageAlt || "Event stream media"}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <p className="text-sm text-foreground whitespace-pre-line">{post.content}</p>
      </CardContent>
    </Card>
  );
};


function EventStreamContent() {
  const params = useParams();
  const searchParams = useSearchParams();

  const eventId = params.eventId as string;
  const [eventName, setEventName] = useState("this Event");
  const [nickname, setNickname] = useState("Guest");
  const [posts, setPosts] = useState<StreamPost[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);

  // Load posts from DB
  const loadPosts = useCallback(async () => {
    try {
      const data = await getEventStreamPosts(eventId);
      setPosts(data.map(p => ({ ...p, timestamp: new Date(p.timestamp) })));
    } catch (err) {
      console.error('Failed to load stream posts:', err);
    } finally {
      setIsLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    const nameParam = searchParams.get("eventName");
    const nickParam = searchParams.get("nickname");
    if (nameParam) setEventName(nameParam);
    if (nickParam) setNickname(nickParam);
  }, [searchParams]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  const handlePostMessage = async () => {
    if (newMessage.trim() === "" || isSending) return;
    setIsSending(true);
    try {
      const newPost = await createEventStreamPost(eventId, nickname, newMessage);
      setPosts(prevPosts => [{ ...newPost, timestamp: new Date(newPost.timestamp) }, ...prevPosts]);
      setNewMessage("");
    } catch {
      // Optimistic fallback: show locally even if write fails (e.g. guest)
      const localPost: StreamPost = {
        id: `local-${Date.now()}`,
        eventId,
        authorNickname: nickname,
        authorAvatarFallback: nickname.substring(0, 2).toUpperCase() || "ME",
        content: newMessage,
        timestamp: new Date(),
      };
      setPosts(prevPosts => [localPost, ...prevPosts]);
      setNewMessage("");
    } finally {
      setIsSending(false);
    }
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

      <CardContent className="p-0 flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : posts.length > 0 ? (
            posts.map(post => <EventPostCard key={post.id} post={post} />)
          ) : (
            <div className="text-center py-10">
              <MessageSquareText className="h-12 w-12 text-muted-foreground opacity-60 mx-auto mb-3" />
              <p className="text-muted-foreground">No posts in this event stream yet.</p>
              <p className="text-sm text-muted-foreground">Be the first to say something!</p>
            </div>
          )}
        </div>

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
            <Button size="icon" onClick={handlePostMessage} disabled={newMessage.trim() === "" || isSending}>
              {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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

export default function EventStreamPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[200px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <EventStreamContent />
    </Suspense>
  );
}