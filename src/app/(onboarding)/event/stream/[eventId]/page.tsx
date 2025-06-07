
"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio, MessageSquareText } from "lucide-react"; // Using Radio as a placeholder for live icon
import React, { useState, useEffect } from "react";

export default function EventStreamPage() {
  const params = useParams();
  const searchParams = useSearchParams();

  const eventId = params.eventId as string;
  const [eventName, setEventName] = useState("this Event");
  const [nickname, setNickname] = useState("Guest");

  useEffect(() => {
    const nameParam = searchParams.get("eventName");
    const nickParam = searchParams.get("nickname");
    if (nameParam) setEventName(nameParam);
    if (nickParam) setNickname(nickParam);
  }, [searchParams]);

  return (
    <>
      <CardHeader className="text-center">
        <div className="flex justify-center mb-2">
            <Radio className="h-12 w-12 text-primary animate-pulse" />
        </div>
        <CardTitle className="text-xl md:text-2xl font-bold font-mono">
            {eventName} - Live
        </CardTitle>
        <CardDescription className="text-md text-muted-foreground pt-1">
          You are in as: <span className="font-semibold text-primary">{nickname}</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-center min-h-[150px] flex flex-col items-center justify-center">
        <MessageSquareText className="h-10 w-10 text-muted-foreground opacity-70 my-4" />
        <p className="text-muted-foreground">
          Event-specific feed, announcements, and connection opportunities will appear here.
        </p>
        <p className="text-sm text-muted-foreground">
          (Placeholder: Imagine live posts and a list of attendees as '{nickname}')
        </p>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 pt-6">
        <Button asChild className="w-full" size="lg" variant="outline">
          <Link href={`/events/${eventId}`}> {/* Link to actual event detail page */}
            View Full Event Details
          </Link>
        </Button>
        <Button asChild className="w-full" size="lg">
          <Link href="/your-comms">
            Back to My Intercom
          </Link>
        </Button>
      </CardFooter>
    </>
  );
}
