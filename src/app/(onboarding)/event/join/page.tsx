
"use client";

import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Users } from "lucide-react";
import React, { useState, useEffect } from "react";

export default function EventOnboardingJoinPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [eventName, setEventName] = useState("the Event");
  const [eventId, setEventId] = useState("");
  const [nickname, setNickname] = useState("");

  useEffect(() => {
    const nameParam = searchParams.get("eventName");
    const idParam = searchParams.get("eventId");
    if (nameParam) setEventName(nameParam);
    if (idParam) setEventId(idParam);
  }, [searchParams]);

  const handleJoinEvent = () => {
    if (!eventId) {
      // Should not happen if QR code is well-formed
      alert("Event ID is missing. Cannot join.");
      return;
    }
    const chosenNickname = nickname.trim() || `Anon${Math.floor(100 + Math.random() * 900)}`; // Default nickname if empty
    router.push(`/event/stream/${eventId}?eventName=${encodeURIComponent(eventName)}&nickname=${encodeURIComponent(chosenNickname)}`);
  };

  return (
    <>
      <CardHeader className="text-center">
         <div className="flex justify-center mb-4">
            <Users className="h-16 w-16 text-primary" />
        </div>
        <CardTitle className="text-2xl md:text-3xl font-bold font-mono">Welcome to {eventName}!</CardTitle>
        <CardDescription className="text-md md:text-lg text-muted-foreground pt-2">
          Join the event space to connect with others.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label htmlFor="nickname" className="text-lg">Your Nickname for this Event:</Label>
          <Input
            id="nickname"
            placeholder="e.g., MusicFan123, TechieTom"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="text-base"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleJoinEvent();
              }
            }}
          />
          <p className="text-xs text-muted-foreground px-1 pt-1">
            Use a nickname to interact. Your main profile stays private unless you choose to share more.
          </p>
        </div>
      </CardContent>
      <CardFooter className="flex flex-col gap-3 pt-6">
        <Button onClick={handleJoinEvent} className="w-full" size="lg">
          Enter Event Space <ArrowRight className="ml-2 h-5 w-5" />
        </Button>
         <Button asChild variant="link" className="text-sm mt-2">
            <Link href="/your-comms">Maybe Later</Link>
        </Button>
      </CardFooter>
    </>
  );
}
