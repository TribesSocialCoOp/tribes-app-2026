
"use client";

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Search as SearchIcon,
  Users,
  CalendarDays,
  User,
  Globe,
  Lock,
  MapPin,
  Loader2,
  Sparkles,
} from "lucide-react";
import { cn } from '@/lib/utils';
import { searchAll } from '@/lib/actions/content-actions';
import { format } from 'date-fns';

type SearchResults = {
  tribes: { id: string; slug: string; name: string; description: string; memberCount: number; isPublic: boolean }[];
  events: { id: string; name: string; description: string; eventDate: Date | null; locationName: string; coverImage?: string }[];
  users: { id: string; name: string; avatarUrl?: string }[];
};

export default function SearchPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = React.useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults(null);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const data = await searchAll(q);
      setResults(data as SearchResults);
    } catch {
      setResults({ tribes: [], events: [], users: [] });
    } finally {
      setIsSearching(false);
    }
  }, []);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => performSearch(value), 350);
  };

  const totalResults = results
    ? results.tribes.length + results.events.length + results.users.length
    : 0;

  return (
    <div className="space-y-6 pb-12 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-baseline md:gap-3 mb-6">
        <h1 className="text-3xl font-bold font-mono tracking-tight flex items-center gap-3">
          <SearchIcon className="h-8 w-8 text-primary" />
          Discover
        </h1>
        <p className="text-muted-foreground mt-1 md:mt-0">
          Search across tribes, events, and members.
        </p>
      </div>

      {/* Search Input */}
      <div className="relative">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          id="search-input"
          placeholder="Search tribes, events, people..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          className="pl-10 h-12 text-base bg-card border-border focus:border-primary focus:ring-primary/20 rounded-xl"
          autoFocus
        />
        {isSearching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 animate-spin text-muted-foreground" />
        )}
      </div>

      {/* Results */}
      {hasSearched && !isSearching && totalResults === 0 && (
        <div className="text-center py-12 space-y-3">
          <SearchIcon className="h-12 w-12 text-muted-foreground/40 mx-auto" />
          <p className="text-muted-foreground">No results found for &quot;{query}&quot;</p>
          <p className="text-sm text-muted-foreground/60">Try a different search term</p>
        </div>
      )}

      {/* Empty State */}
      {!hasSearched && (
        <div className="text-center py-16 space-y-4">
          <Sparkles className="h-16 w-16 text-primary/30 mx-auto" />
          <p className="text-lg text-muted-foreground">Start typing to discover tribes, events, and people</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {['Tech', 'Music', 'Gaming', 'Art'].map(tag => (
              <Button
                key={tag}
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => { setQuery(tag); performSearch(tag); }}
              >
                {tag}
              </Button>
            ))}
          </div>
        </div>
      )}

      {results && totalResults > 0 && (
        <div className="space-y-8">
          {/* Tribes */}
          {results.tribes.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                <Users className="h-5 w-5 text-primary" />
                Tribes
                <Badge variant="secondary" className="ml-1">{results.tribes.length}</Badge>
              </h2>
              <div className="space-y-2">
                {results.tribes.map(tribe => (
                  <Link key={tribe.id} href={`/t/${tribe.slug}`}>
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-border/50">
                      <CardContent className="p-4 flex items-center gap-4">
                        <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Users className="h-6 w-6 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-foreground truncate">{tribe.name}</span>
                            <Badge variant="outline" className="text-xs shrink-0">
                              {tribe.isPublic ? <><Globe className="h-3 w-3 mr-1" />Public</> : <><Lock className="h-3 w-3 mr-1" />Private</>}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground truncate">{tribe.description}</p>
                          <span className="text-xs text-muted-foreground/60">{tribe.memberCount} members</span>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Events */}
          {results.events.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                <CalendarDays className="h-5 w-5 text-primary" />
                Events
                <Badge variant="secondary" className="ml-1">{results.events.length}</Badge>
              </h2>
              <div className="space-y-2">
                {results.events.map(event => (
                  <Link key={event.id} href={`/events/${event.id}`}>
                    <Card className="hover:bg-accent/50 transition-colors cursor-pointer border-border/50">
                      <CardContent className="p-4 flex items-center gap-4">
                        {event.coverImage ? (
                          <div className="relative h-12 w-16 rounded-lg overflow-hidden shrink-0">
                            <Image src={event.coverImage} alt={event.name} fill style={{objectFit: "cover"}} />
                          </div>
                        ) : (
                          <div className="h-12 w-16 rounded-lg bg-accent/20 flex items-center justify-center shrink-0">
                            <CalendarDays className="h-6 w-6 text-primary" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="font-semibold text-foreground truncate block">{event.name}</span>
                          <p className="text-sm text-muted-foreground truncate">{event.description}</p>
                          <div className="flex items-center gap-3 text-xs text-muted-foreground/60 mt-1">
                            {event.eventDate && (
                              <span className="flex items-center gap-1">
                                <CalendarDays className="h-3 w-3" />
                                {format(new Date(event.eventDate), "MMM d, yyyy")}
                              </span>
                            )}
                            {event.locationName && (
                              <span className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.locationName}
                              </span>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Users */}
          {results.users.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-lg font-semibold flex items-center gap-2 text-foreground">
                <User className="h-5 w-5 text-primary" />
                People
                <Badge variant="secondary" className="ml-1">{results.users.length}</Badge>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {results.users.map(user => (
                  <Card key={user.id} className="hover:bg-accent/50 transition-colors border-border/50">
                    <CardContent className="p-4 flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                        {user.avatarUrl ? (
                          <Image src={user.avatarUrl} alt={user.name} width={40} height={40} className="rounded-full object-cover" />
                        ) : (
                          user.name.charAt(0).toUpperCase()
                        )}
                      </div>
                      <span className="font-medium text-foreground truncate">{user.name}</span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
