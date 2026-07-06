"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Compass, Users, Smile, CalendarDays, Search, Loader2, BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { Tribe, Event } from '@/lib/types';
import { getTribes } from '@/lib/actions/tribe-actions';
import { getEvents } from '@/lib/actions/event-actions';
import { moodsData } from '@/lib/moods-data';
import { TribeCard } from '@/components/cards/tribe-card';
import { ViewToggle, getPersistedViewMode, type ViewMode } from '@/components/ui/view-toggle';

type DiscoverTab = 'tribes' | 'moods' | 'events' | 'more';

export default function DiscoverClient() {
  const [activeTab, setActiveTab] = useState<DiscoverTab>('tribes');
  const [tribes, setTribes] = useState<Tribe[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  useEffect(() => {
    setViewMode(getPersistedViewMode());
    async function fetchData() {
      try {
        const [tribesResult, eventsResult] = await Promise.all([
          getTribes(),
          getEvents(),
        ]);
        setTribes(tribesResult);
        setEvents(eventsResult);
      } catch (err) {
        console.error('[DiscoverPage] Failed to fetch data:', err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchData();
  }, []);

  // Discover shows public tribes + listed private tribes (e.g. NSFW tribes that opted in).
  // Unlisted private tribes are accessible via My Tribes only.
  const filteredTribes = tribes.filter(t =>
    (t.isPublic !== false || t.isListed) &&
    (t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const tabs: { key: DiscoverTab; label: string; icon: React.ElementType }[] = [
    { key: 'tribes', label: 'Tribes', icon: Users },
    { key: 'moods', label: 'Moods', icon: Smile },
    { key: 'events', label: 'Events', icon: CalendarDays },
    { key: 'more', label: 'More', icon: Compass },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 md:space-y-6">
      <header className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1 flex flex-col md:flex-row md:items-baseline md:gap-3">
          <h1 className="text-2xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Discover</h1>
          <p className="text-sm md:text-lg text-muted-foreground mt-1 md:mt-0">
            Explore tribes, mood streams, events, and more.
          </p>
        </div>
        <ViewToggle value={viewMode} onChange={setViewMode} className="mt-2 shrink-0" />
      </header>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg overflow-x-auto max-w-full scrollbar-none">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "px-4 py-2 rounded-md text-sm font-medium transition-all whitespace-nowrap",
              activeTab === tab.key
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <tab.icon className="inline-block mr-1.5 h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'tribes' && (
        <div className={cn(
          viewMode === 'grid'
            ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
            : "space-y-2"
        )}>
          {filteredTribes.length > 0 ? filteredTribes.map(tribe => (
            <TribeCard
              key={tribe.id}
              tribe={tribe}
              view={viewMode}
            />
          )) : (
            <div className="col-span-full text-center py-12 text-muted-foreground">
              No tribes found{searchQuery ? ` for "${searchQuery}"` : ''}.
            </div>
          )}
        </div>
      )}

      {activeTab === 'moods' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {moodsData.map(mood => (
            <Link key={mood.slug} href={`/moods/${mood.slug}`} className="block group">
              <Card className="text-center hover:shadow-md transition-all duration-200 hover:border-primary/30 h-full">
                <CardContent className="p-4 flex flex-col items-center gap-2">
                  <span className="text-3xl">{mood.emoji}</span>
                  <p className="font-medium text-sm">{mood.name}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-2">{mood.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {activeTab === 'events' && (
        <div className="space-y-4">
          {events.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map(event => (
                <Card key={event.id} className="overflow-hidden hover:shadow-md transition-all duration-200">
                  {event.coverImage && (
                    <div className="relative h-28 w-full overflow-hidden">
                      <Image src={event.coverImage} alt={event.name} fill className="object-cover" />
                    </div>
                  )}
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{event.name}</CardTitle>
                    <CardDescription className="text-xs">
                      <CalendarDays className="inline h-3 w-3 mr-1" />
                      {new Date(event.eventDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                      {event.locationName && ` • ${event.locationName}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="text-xs text-muted-foreground line-clamp-2 pb-3">
                    {event.description}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="text-center py-12 shadow-none border-dashed">
              <CardContent className="p-4">
                <CalendarDays className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground text-sm">No upcoming events. Check back soon!</p>
              </CardContent>
            </Card>
          )}
          <div className="text-center">
            <Link href="/events">
              <Button variant="outline" size="sm">View All Events</Button>
            </Link>
          </div>
        </div>
      )}

      {activeTab === 'more' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link href="/search" className="block group">
            <Card className="hover:shadow-md transition-all duration-200 hover:border-primary/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Search className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Search</p>
                  <p className="text-xs text-muted-foreground">Find people, tribes, and content</p>
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/our-story" className="block group">
            <Card className="hover:shadow-md transition-all duration-200 hover:border-primary/30">
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-sm">Our Story</p>
                  <p className="text-xs text-muted-foreground">The Tribes journey</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>
      )}
    </div>
  );
}
