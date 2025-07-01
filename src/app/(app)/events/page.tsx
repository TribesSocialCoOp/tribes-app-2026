
"use client";

import React, { useState, useEffect } from 'react';
import Link from "next/link";
import Image from "next/image";
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CalendarDays, Search, PlusCircle, ArrowRight, Globe, Lock, Users, MapPin, HeartHandshake, Loader2 } from "lucide-react";
import { getEvents } from '@/lib/services/event-service';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import type { Event } from '@/lib/types';

const EventCard: React.FC<{ event: Event }> = ({ event }) => {
  return (
    <Card className="shadow-lg hover:shadow-xl transition-shadow flex flex-col overflow-hidden">
      <Link href={`/events/${event.id}`} passHref className="flex flex-col flex-grow">
        {event.coverImage && (
          <div className="relative h-40 w-full">
            <Image
              src={event.coverImage}
              alt={event.name}
              fill
              style={{objectFit:"cover"}}
              data-ai-hint={event.dataAiHintCover || "event image"}
            />
            <Badge variant={event.isPublic ? "secondary" : "destructive"} className="absolute top-2 right-2 text-xs py-1 px-2 backdrop-blur-sm bg-black/40 text-white border-white/30">
              {event.isPublic ? <Globe className="inline-block mr-1 h-3 w-3" /> : <Lock className="inline-block mr-1 h-3 w-3" />}
              {event.isPublic ? "Public" : "Private"}
            </Badge>
          </div>
        )}
        {!event.coverImage && (
            <div className="h-40 w-full bg-muted flex items-center justify-center relative">
                <CalendarDays className="h-16 w-16 text-muted-foreground opacity-50" />
                 <Badge variant={event.isPublic ? "secondary" : "destructive"} className="absolute top-2 right-2 text-xs py-1 px-2">
                    {event.isPublic ? <Globe className="inline-block mr-1 h-3 w-3" /> : <Lock className="inline-block mr-1 h-3 w-3" />}
                    {event.isPublic ? "Public" : "Private"}
                </Badge>
            </div>
        )}
        <CardHeader className="pb-2">
          <CardTitle className="text-xl font-semibold truncate tracking-normal">{event.name}</CardTitle>
        </CardHeader>
        <CardContent className="flex-grow pb-3 space-y-2">
          <div className="flex items-center text-sm text-muted-foreground">
            <CalendarDays className="h-4 w-4 mr-2 text-primary" />
            <span>{format(event.eventDate, "MMM dd, yyyy 'at' p")}</span>
          </div>
           <div className="flex items-center text-sm text-muted-foreground">
            <MapPin className="h-4 w-4 mr-2 text-primary" />
            <span>{event.locationName}{event.locationCityRegion && event.locationCityRegion.toLowerCase() !== "online" ? `, ${event.locationCityRegion}` : ''}</span>
          </div>
          <div className="flex items-center text-sm text-muted-foreground">
            <Users className="h-4 w-4 mr-2 text-primary" />
            <span>Organized by: {event.associatedTribe}</span>
          </div>
          <CardDescription className="text-sm h-12 overflow-hidden text-ellipsis leading-relaxed">
            {event.description}
          </CardDescription>
        </CardContent>
      </Link>
      <CardFooter>
        <Link href={`/events/${event.id}`} passHref className="w-full">
          <Button variant="default" className="w-full bg-primary hover:bg-primary/90">
            View Details <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </Link>
      </CardFooter>
    </Card>
  );
};

export default function EventsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { role } = useUser();
  const canCreate = role !== 'Human_Free';

  useEffect(() => {
    const fetchEvents = async () => {
      setIsLoading(true);
      const fetchedEvents = await getEvents();
      setEvents(fetchedEvents);
      setIsLoading(false);
    };
    fetchEvents();
  }, []);

  const filteredEvents = events.filter(event =>
    event.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.keywords.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.associatedTribe.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.locationName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    event.locationCityRegion.toLowerCase().includes(searchTerm.toLowerCase())
  ).sort((a,b) => a.eventDate.getTime() - b.eventDate.getTime()); // Sort by upcoming first

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Discover Events</h1>
          <p className="text-lg text-muted-foreground mt-1">
            Find upcoming gatherings, workshops, and more from all tribes.
          </p>
        </div>
        <Link href={canCreate ? "/events/create" : "/billing"} passHref>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {canCreate ? (
              <PlusCircle className="mr-2 h-5 w-5" />
            ) : (
              <HeartHandshake className="mr-2 h-5 w-5" />
            )}
            {canCreate ? "Create New Event" : "Upgrade to Create"}
          </Button>
        </Link>
      </header>

      <div className="mb-8">
        <div className="relative max-w-lg mx-auto sm:mx-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            placeholder="Search events by name, keyword, location, or tribe..."
            className="pl-10 py-3 text-base rounded-full shadow-sm w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      ) : filteredEvents.length > 0 ? (
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredEvents.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </section>
      ) : (
        <Card className="text-center p-8 col-span-full">
            <CalendarDays className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-50" />
            <CardTitle className="tracking-normal">No Events Found</CardTitle>
            <CardDescription className="mt-2 mb-4">
                {searchTerm ? "No events match your search criteria." : "There are no events listed currently. Why not create one?"}
            </CardDescription>
            {searchTerm && (
                <Button variant="outline" onClick={() => setSearchTerm('')}>Clear Search</Button>
            )}
        </Card>
      )}
    </div>
  );
}
