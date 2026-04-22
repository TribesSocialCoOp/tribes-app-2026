
"use client";

import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, CalendarDays, Users, Globe, Lock, Tag, Info, MapPin, ExternalLink, Radio, CheckCircle2, Star, Heart, Loader2 } from "lucide-react";
import { cn } from '@/lib/utils';
import InteractiveMap from '@/components/maps/interactive-map';
import type { Tribe as TribeInfo } from '@/lib/types';
import { findTribeByName } from '@/lib/actions/tribe-actions';
import { getEventById, rsvpToEvent, getEventRsvpCount, getUserRsvpStatus, getEventAttendeesPreview } from '@/lib/actions/event-actions';
import type { Event } from '@/lib/types';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';


export default function EventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const eventId = params.eventId as string;

  const { role } = useUser();
  const { toast } = useToast();
  const isLoggedIn = !!role;

  const [event, setEvent] = useState<Event | null>(null);
  const [organizingTribe, setOrganizingTribe] = useState<TribeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [rsvpStatus, setRsvpStatus] = useState<'going' | 'interested' | 'not_going' | null>(null);
  const [rsvpCount, setRsvpCount] = useState(0);
  const [isRsvping, setIsRsvping] = useState(false);
  const [attendees, setAttendees] = useState<{ id: string; name: string; avatar?: string }[]>([]);
  const [attendeeTotalCount, setAttendeeTotalCount] = useState(0);

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
          // Fetch RSVP data
          const [count, userStatus, attendeeData] = await Promise.all([
            getEventRsvpCount(eventId),
            getUserRsvpStatus(eventId),
            getEventAttendeesPreview(eventId),
          ]);
          setRsvpCount(count);
          setRsvpStatus(userStatus);
          setAttendees(attendeeData.users);
          setAttendeeTotalCount(attendeeData.totalCount);
        } else {
          setEvent(null);
          setOrganizingTribe(null);
        }
        setIsLoading(false);
      };
      fetchData();
    }
  }, [eventId]);

  const handleRsvp = async (status: 'going' | 'interested' | 'not_going') => {
    if (!isLoggedIn) {
      router.push('/login');
      return;
    }
    setIsRsvping(true);
    try {
      const result = await rsvpToEvent(eventId, status);
      setRsvpStatus(status);
      setRsvpCount(result.rsvpCount);
      // Refresh attendees list after RSVP change
      const attendeeData = await getEventAttendeesPreview(eventId);
      setAttendees(attendeeData.users);
      setAttendeeTotalCount(attendeeData.totalCount);
      const labels = { going: "Going", interested: "Interested", not_going: "Not Going" };
      toast({
        title: `RSVP: ${labels[status]}`,
        description: result.pointsAwarded > 0 ? `+${result.pointsAwarded} contribution points earned!` : `Your RSVP has been updated.`,
      });
    } catch (e: unknown) {
      toast({ title: 'Error', description: ((e instanceof Error) ? e.message : 'An error occurred'), variant: 'destructive' });
    } finally {
      setIsRsvping(false);
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

          <div className="pt-4 space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              <span className="font-medium">{rsvpCount} going</span>
              {event.rsvpPointsReward && event.rsvpPointsReward > 0 && (
                <Badge variant="outline" className="text-xs border-amber-500 text-amber-600 bg-amber-500/10">
                  <Star className="h-3 w-3 mr-1 fill-current" /> +{event.rsvpPointsReward} pts for attending
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                size="lg"
                disabled={isRsvping}
                onClick={() => handleRsvp('going')}
                className={cn(
                  "flex-1 md:flex-none",
                  rsvpStatus === 'going'
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : 'bg-green-600/20 text-green-700 border border-green-600/50 hover:bg-green-600/30'
                )}
              >
                {isRsvping ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <CheckCircle2 className="mr-2 h-5 w-5" />}
                {rsvpStatus === 'going' ? "You're Going!" : 'Going'}
              </Button>
              <Button
                size="lg"
                variant="outline"
                disabled={isRsvping}
                onClick={() => handleRsvp('interested')}
                className={cn(
                  "flex-1 md:flex-none",
                  rsvpStatus === 'interested' && 'border-amber-500 text-amber-600 bg-amber-500/10'
                )}
              >
                <Heart className={cn("mr-2 h-5 w-5", rsvpStatus === 'interested' && 'fill-amber-500 text-amber-500')} />
                Interested
              </Button>
              <Button
                size="lg"
                variant="ghost"
                disabled={isRsvping}
                onClick={() => handleRsvp('not_going')}
                className={cn(
                  "flex-1 md:flex-none text-muted-foreground",
                  rsvpStatus === 'not_going' && 'bg-muted'
                )}
              >
                Not Going
              </Button>
            </div>

            {/* Attendee List */}
            {attendeeTotalCount > 0 && (
              <div className="pt-3 border-t border-border/50">
                <p className="text-xs font-medium text-muted-foreground mb-2">Who&apos;s going</p>
                <div className="flex items-center gap-1">
                  <div className="flex -space-x-2">
                    {attendees.map(att => (
                      <div key={att.id} title={att.name}
                        className="h-8 w-8 rounded-full border-2 border-background bg-primary/10 flex items-center justify-center text-xs font-semibold text-primary overflow-hidden">
                        {att.avatar ? (
                          <img src={att.avatar} alt={att.name} className="h-full w-full object-cover" />
                        ) : (
                          att.name.charAt(0).toUpperCase()
                        )}
                      </div>
                    ))}
                  </div>
                  {attendeeTotalCount > attendees.length && (
                    <span className="text-xs text-muted-foreground ml-2">+{attendeeTotalCount - attendees.length} more</span>
                  )}
                </div>
              </div>
            )}
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
