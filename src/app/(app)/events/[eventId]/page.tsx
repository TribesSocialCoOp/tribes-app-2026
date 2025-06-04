
"use client";

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarDays, Users, Globe, Lock, Tag, Info, MapPin, ExternalLink } from "lucide-react";
import { cn } from '@/lib/utils';

// Define an interface for an Event
export interface Event {
  id: string;
  name: string;
  keywords: string;
  description: string;
  eventDate: Date;
  associatedTribe: string; // This is the tribe's NAME for now for matching
  coverImage?: string; // URL or path to the image
  dataAiHintCover?: string;
  isPublic: boolean;
  creatorId: string; // User ID of the event creator
  locationName: string; // e.g., "Community Hall", "Zoom Online"
  locationCityRegion: string; // e.g., "Springfield, IL", "Online"
}

// Sample event data (mimicking what might come from a database)
export const sampleEventsData: Event[] = [
  {
    id: "event1",
    name: "Summer Music Festival Kick-off",
    keywords: "Live Music, Outdoor, Summer, Festival",
    description: "Join us for the grand opening of the Summer Music Festival! Featuring top local bands, food trucks, and amazing vibes. Don't miss out on the biggest party of the summer. Get ready to dance and celebrate with us under the stars. This is an event you won't want to miss, filled with great music and fun for everyone.",
    eventDate: new Date(new Date().setDate(new Date().getDate() + 30)), // Approx 30 days from now
    associatedTribe: "The Local Gig Circuit", // Matches Tribe Name
    coverImage: "https://placehold.co/1200x400.png",
    dataAiHintCover: "music festival concert",
    isPublic: true,
    creatorId: "user123",
    locationName: "Downtown Park Amphitheater",
    locationCityRegion: "Springfield, IL",
  },
  {
    id: "event2",
    name: "Tech Innovators Summit - AI Edition",
    keywords: "Technology, AI, Networking, Workshop",
    description: "A deep dive into the latest advancements in Artificial Intelligence. Network with industry leaders, attend insightful workshops, and discover the future of tech. This summit is perfect for developers, researchers, and tech enthusiasts.",
    eventDate: new Date(new Date().setDate(new Date().getDate() + 60)), // Approx 60 days from now
    associatedTribe: "AI Innovators", // Matches Tribe Name
    coverImage: "https://placehold.co/1200x400.png",
    dataAiHintCover: "technology conference abstract",
    isPublic: true,
    creatorId: "user456",
    locationName: "Grand Tech Convention Center",
    locationCityRegion: "New York, NY",
  },
  {
    id: "event3",
    name: "Artisan Craft Fair - Members Preview",
    keywords: "Crafts, Art, Local, Shopping",
    description: "A special preview night for members of the Artisan Alley Collective. Get first dibs on unique handmade items before the public opening. Support local artists and find beautiful crafts. Light refreshments will be served.",
    eventDate: new Date(new Date().setDate(new Date().getDate() + 15)), // Approx 15 days from now
    associatedTribe: "Artisan Alley Collective", // Matches Tribe Name
    // No cover image for this one
    isPublic: false, // Private event
    creatorId: "user789",
    locationName: "The Artful Space Gallery",
    locationCityRegion: "Portland, OR",
  },
  {
    id: "event4",
    name: "AI Ethics Debate Night",
    keywords: "AI, Ethics, Discussion, Debate",
    description: "Join AI Innovators for a lively debate on the ethical implications of current AI trends. Featuring guest speakers and an open Q&A session.",
    eventDate: new Date(new Date().setDate(new Date().getDate() + 40)), 
    associatedTribe: "AI Innovators", // Another event for AI Innovators
    coverImage: "https://placehold.co/1200x400.png",
    dataAiHintCover: "debate discussion abstract",
    isPublic: true,
    creatorId: "user456",
    locationName: "University Lecture Hall B",
    locationCityRegion: "Cambridge, MA",
  },
];


export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (eventId) {
      setIsLoading(true);
      // Simulate fetching event data
      const foundEvent = sampleEventsData.find(e => e.id === eventId);
      if (foundEvent) {
        setEvent(foundEvent);
      } else {
        setEvent(null); // Or redirect to a 404 page
      }
      setIsLoading(false);
    }
  }, [eventId]);

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
              layout="fill"
              objectFit="cover"
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
                <p className="text-muted-foreground">{event.associatedTribe}</p>
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
              {event.locationName.toLowerCase() !== "online" && (
                <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" className="inline-block">
                    <Button variant="outline" size="sm">
                        <ExternalLink className="mr-2 h-4 w-4" /> View on Map
                    </Button>
                </a>
              )}
            </div>
          )}

          <div className="mt-4 p-3 bg-muted/30 rounded-md space-y-2">
            <h4 className="text-md font-semibold text-foreground flex items-center">
                <MapPin className="h-4 w-4 mr-2 text-muted-foreground"/>
                Map Preview
            </h4>
            <div className="aspect-video bg-muted rounded-md flex items-center justify-center relative overflow-hidden border">
                <Image 
                    src="https://placehold.co/600x300.png" 
                    alt="Map placeholder"
                    layout="fill"
                    objectFit="cover"
                    data-ai-hint="map location placeholder"
                />
                <p className="absolute bottom-2 right-2 text-xs bg-black/50 text-white px-2 py-1 rounded">
                    Interactive map preview coming soon
                </p>
            </div>
          </div>
          
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
            <Button size="lg" className="w-full md:w-auto bg-accent text-accent-foreground hover:bg-accent/90">
              RSVP / Get Tickets (Coming Soon)
            </Button>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}

    
