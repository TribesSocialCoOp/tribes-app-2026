
"use client";

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarDays, Users, Globe, Lock, Tag, Info, MapPin, ExternalLink, Radio } from "lucide-react";
import { cn } from '@/lib/utils';
import InteractiveMap from '@/components/maps/interactive-map';
import type { Tribe as TribeInfo } from '@/lib/data';
import { findTribeByName } from '@/lib/data-access/tribes';
import { getEventById } from '@/lib/services/event-service';
import type { Event } from '@/lib/types';


export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [organizingTribe, setOrganizingTribe] = useState<TribeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
      const fetchData = async () => {
        setIsLoading(true);
        const foundEvent = await getEventById(eventId);
        if (foundEvent) {
          setEvent(foundEvent);
          // Fetch tribe data asynchronously using the data access layer
          const tribe = await findTribeByName(foundEvent.associatedTribe);
          setOrganizingTribe(tribe || null);
        } else {
          setEvent(null);
          setOrganizingTribe(null);
        }
        setIsLoading(false);
      };
      fetchData();
    }
  }, [eventId]);

  const handleJoinEventStream = () => {
    if (event) {
      router.push(`/event/join?eventId=${event.id}&eventName=${encodeURIComponent(event.name)}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <p className="text-muted-foreground">Loading event details...</p>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Info className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Event Not Found</h1>
        <p className="text-muted-foreground mb-6">The event you are looking for does not exist or may have been moved.</p>
        <Button onClick={() => router.push('/events')} variant="outline">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Events List
        </Button>
      </div>
    );
  }
  
  const googleMapsQuery = encodeURIComponent(`${event.locationName}, ${event.locationCityRegion}`);
  const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${googleMapsQuery}`;

  return (
    <div className="space-y-6 pb-12 max-w-4xl mx-auto">
      <Button variant="outline" size="sm" onClick={() => router.back()} className="mb-6 mt-2">
        <ArrowLeft className="mr-2 h-4 w-4" /> Back
      </Button>

      <Card className="overflow-hidden shadow-xl">
        {event.coverImage && (
          <div className="relative h-56 md:h-72 w-full">
            <Image
              src={event.coverImage}
              alt={`${event.name} cover image`}
              fill
              style={{objectFit: "cover"}}
              data-ai-hint={event.dataAiHintCover || "event banner"}
              priority
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-transparent" />
            <CardHeader className="absolute bottom-0 left-0 right-0 z-10 p-4 md:p-6">
              <CardTitle className="text-3xl md:text-4xl font-bold font-mono tracking-tight text-white drop-shadow-lg">
                {event.name}
              </CardTitle>
              <div className="flex items-center space-x-3 pt-1">
                <Badge variant={event.isPublic ? "secondary" : "destructive"} className="text-xs py-1 px-2 backdrop-blur-sm bg-black/30 text-white border-white/50">
                  {event.isPublic ? <><Globe className="inline-block mr-1.5 h-3.5 w-3.5" />Public Event</> : <><Lock className="inline-block mr-1.5 h-3.5 w-3.5" />Private Event</>}
                </Badge>
              </div>
            </CardHeader>
          </div>
        )}
        {!event.coverImage && (
           <CardHeader className="p-4 md:p-6">
             <CardTitle className="text-3xl md:text-4xl font-bold font-mono tracking-tight text-foreground">
               {event.name}
             </CardTitle>
             <div className="flex items-center space-x-3 pt-1">
               <Badge variant={event.isPublic ? "secondary" : "destructive"} className="text-xs py-1 px-2">
                 {event.isPublic ? <><Globe className="inline-block mr-1.5 h-3.5 w-3.5" />Public Event</> : <><Lock className="inline-block mr-1.5 h-3.5 w-3.5" />Private Event</>}
               </Badge>
             </div>
           </CardHeader>
        )}
        <CardContent className="p-4 md:p-6 space-y-6">
          <div>
            <h3 className="text-lg font-semibold text-foreground mb-1">Event Details</h3>
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{event.description}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="flex items-start p-3 bg-muted/50 rounded-md">
              <CalendarDays className="h-5 w-5 text-primary mr-3 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-foreground">Date & Time</p>
                <p className="text-muted-foreground">{format(event.eventDate, "PPPPp")} ({format(event.eventDate, "eeee")})</p>
              </div>
            </div>
            <div className="flex items-start p-3 bg-muted/50 rounded-md">
              <Users className="h-5 w-5 text-primary mr-3 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-foreground">Organized By</p>
                {organizingTribe ? (
                  <Link href={`/tribes/${organizingTribe.id}`} className="text-primary hover:underline">
                    {event.associatedTribe}
                  </Link>
                ) : (
                  <p className="text-muted-foreground">{event.associatedTribe}</p>
                )}
              </div>
            </div>
          </div>

          {(event.locationName || event.locationCityRegion) && (
             <div className="p-3 bg-muted/50 rounded-md text-sm space-y-3">
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-primary mr-3 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-foreground">Location</p>
                  {event.locationName && <p className="text-muted-foreground">{event.locationName}</p>}
                  {event.locationCityRegion && <p className="text-muted-foreground">{event.locationCityRegion}</p>}
                  {event.locationName.toLowerCase() === "online" && !event.locationCityRegion && <p className="text-muted-foreground">This is an online event.</p>}
                </div>
              </div>
              {event.locationName.toLowerCase() !== "online" && event.latitude && event.longitude && (
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block mb-2">
                    <Button variant="outline" size="sm">
                        <ExternalLink className="mr-2 h-4 w-4" /> View on Map
                    </Button>
                </a>
              )}
            </div>
          )}

          {event.latitude && event.longitude && event.locationName.toLowerCase() !== "online" && (
            <div className="mt-4 p-3 bg-muted/30 rounded-md space-y-2">
              <h4 className="text-md font-semibold text-foreground flex items-center">
                  <MapPin className="h-4 w-4 mr-2 text-muted-foreground"/>
                  Map Preview
              </h4>
              <InteractiveMap
                  latitude={event.latitude}
                  longitude={event.longitude}
                  locationName={`${event.locationName}, ${event.locationCityRegion}`}
              />
            </div>
          )}
          
          {event.keywords && (
            <div>
                <h3 className="text-md font-semibold text-foreground mb-2 flex items-center">
                    <Tag className="h-4 w-4 mr-2 text-primary"/>
                    Keywords
                </h3>
                <div className="flex flex-wrap gap-2">
                    {event.keywords.split(',').map(keyword => (
                        <Badge key={keyword.trim()} variant="outline">{keyword.trim()}</Badge>
                    ))}
                </div>
            </div>
          )}

          <div className="pt-4">
            <Button size="lg" className="w-full md:w-auto bg-accent text-accent-foreground hover:bg-accent/90" onClick={handleJoinEventStream}>
              <Radio className="mr-2 h-5 w-5"/> Join Event Live Stream
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
