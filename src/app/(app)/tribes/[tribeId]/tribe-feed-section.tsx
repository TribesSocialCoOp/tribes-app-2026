"use client";

import React, { useMemo } from 'react';
import { format } from 'date-fns';
import Image from 'next/image';
import Link from 'next/link';
import { eventPath } from '@/lib/utils/paths';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Edit3, MessageSquareText, CalendarDays, MapPin, LockKeyhole } from "lucide-react";
import { LoadMoreButton } from "@/components/ui/load-more-button";
import type { Event, TribePost } from '@/lib/types';
import { TribePostCard } from './tribe-post-card';
import { useTribeDetail } from './tribe-detail-context';
import { ComposeBox } from '@/components/compose/compose-box';
import { useScrollToPost } from '@/hooks/use-scroll-to-post';

// ─── EventHighlightCard ──────────────────────────────────────────────────────

const EventHighlightCard: React.FC<{ event: Event }> = ({ event }) => (
  <Card className="overflow-hidden shadow-lg border-primary/50 hover:shadow-xl transition-shadow bg-primary/5">
    <CardHeader className="p-3">
      <Badge variant="secondary" className="w-fit mb-1 bg-primary/80 text-primary-foreground text-xs">UPCOMING EVENT</Badge>
      <CardTitle className="text-lg font-semibold tracking-tight text-primary">{event.name}</CardTitle>
    </CardHeader>
    <CardContent className="p-3 pt-0 text-sm">
      {event.coverImage && (
        <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-lg border">
          <Image src={event.coverImage} alt={event.name} fill style={{ objectFit: 'cover' }} data-ai-hint={event.dataAiHintCover || "event thumbnail"} />
        </div>
      )}
      <div className="flex items-center text-muted-foreground mb-1">
        <CalendarDays className="h-4 w-4 mr-2 text-primary" />
        <span>{format(event.eventDate, "MMM dd, yyyy 'at' p")}</span>
      </div>
      <div className="flex items-center text-muted-foreground mb-2">
        <MapPin className="h-4 w-4 mr-2 text-primary" />
        <span>{event.locationName}{event.locationCityRegion && event.locationCityRegion.toLowerCase() !== "online" ? `, ${event.locationCityRegion}` : ''}</span>
      </div>
      <p className="text-muted-foreground line-clamp-2">{event.description}</p>
    </CardContent>
    <CardFooter className="p-3 border-t bg-primary/10">
      <Link href={eventPath(event.id, event.slug)} passHref className="w-full">
        <Button variant="default" size="sm" className="w-full bg-primary hover:bg-primary/90">View Event</Button>
      </Link>
    </CardFooter>
  </Card>
);

// ─── FeedItem type ───────────────────────────────────────────────────────────

type FeedItem =
  | { id: string; type: 'event'; timestamp: Date; isPinned: boolean; data: Event }
  | { id: string; type: 'post'; timestamp: Date; isPinned: boolean; data: TribePost; isPromoted: boolean; isReported: boolean; isCurrentUserAuthor: boolean; };

// ─── TribeFeedSection ────────────────────────────────────────────────────────

export function TribeFeedSection() {
  const { state, dispatch, isLoggedIn, currentUserId, syncAllData, hasTribeKey, isTribeAdmin, hasMorePosts, isLoadingMorePosts, loadMorePosts } = useTribeDetail();
  const { tribe, posts, events, isMember, promotedPostIds, reportedPostIds } = state;

  const combinedFeedItems = useMemo(() => {
    if (!tribe) return [];

    const eventItems = (isMember ? events : []).map(event => ({
      id: `event-${event.id}`,
      type: 'event' as const,
      timestamp: event.eventDate,
      isPinned: true,
      data: event,
    }));

    const postItems = (isMember || tribe?.isPublic ? posts : posts.filter(p => p.isPinned || promotedPostIds.has(p.id)))
      .map(post => ({
        id: `post-${post.id}`,
        type: 'post' as const,
        timestamp: post.timestamp,
        isPinned: !!post.isPinned,
        data: post,
        isPromoted: promotedPostIds.has(post.id),
        isReported: reportedPostIds.has(post.id) && !post.isRemoved,
        isCurrentUserAuthor: post.authorId === currentUserId,
      }));

    const allItems: FeedItem[] = [...eventItems, ...postItems];
    allItems.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return b.timestamp.getTime() - a.timestamp.getTime();
    });
    return allItems;
  }, [tribe, events, posts, isMember, promotedPostIds, reportedPostIds, currentUserId]);

  // Deep-link: scroll to a specific post when ?postId=<id> or ?post=<id> is present
  useScrollToPost([combinedFeedItems.length]);

  if (!tribe) return null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between px-1">
        <h2 className="text-xl font-semibold text-foreground tracking-normal">
          {(isMember || tribe?.isPublic) ? "Feed" : "Featured Posts in Mood Streams"}
        </h2>
      </div>

      {isMember && !tribe.isPublic && hasTribeKey === false && !isTribeAdmin && (
        <Alert variant="default" className="bg-amber-500/10 border-amber-500/50 text-amber-600 dark:text-amber-400 mb-6">
          <LockKeyhole className="h-5 w-5 !text-amber-500" />
          <AlertTitle className="font-semibold text-amber-700 dark:text-amber-500">Cryptographic Sync Pending</AlertTitle>
          <AlertDescription className="text-sm mt-1 leading-relaxed">
            You have joined this tribe, but your device is waiting to receive the encryption keys. Posts will remain locked until a tribe admin comes online to securely distribute the keys.
          </AlertDescription>
        </Alert>
      )}

      {isMember && isLoggedIn && (
        <div className="mb-6">
          <ComposeBox
            onPostCreated={() => syncAllData(true)}
            defaultRing="tribes"
            defaultTribeId={tribe.id}
          />
        </div>
      )}
      {combinedFeedItems.length > 0 ? (
        combinedFeedItems.map(item => {
          if (item.type === 'event') {
            return <EventHighlightCard key={item.id} event={item.data as Event} />;
          }
          const post = item.data as TribePost;
          const postKey = `post-${post.id}-${post.isRemoved}-${post.canBeReposted}-${item.isReported}`;
          return (
            <div key={postKey} id={`post-${post.id}`}>
              <TribePostCard
                post={post}
                isPromoted={item.isPromoted}
                isReported={item.isReported}
                isCurrentUserAuthor={item.isCurrentUserAuthor}
              />
            </div>
          );
        })
      ) : (
        <Card className="text-center py-12 shadow-md">
          <CardContent className="flex flex-col items-center justify-center">
            <MessageSquareText className="h-16 w-16 text-muted-foreground opacity-50 mb-4" />
            <h3 className="text-xl font-semibold text-foreground mb-1">
              {(isMember || tribe?.isPublic) ? `No Posts Yet in ${tribe.name}` : `No Featured Posts from ${tribe.name} in Mood Streams`}
            </h3>
            <p className="text-muted-foreground">
              {(isMember || tribe?.isPublic) ? `Be the first to share something!` : "Check back later for promoted content from this tribe."}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Pagination: Load More */}
      {combinedFeedItems.length > 0 && (
        <LoadMoreButton
          onClick={loadMorePosts}
          isLoading={isLoadingMorePosts}
          hasMore={hasMorePosts}
          loadedCount={state.posts.length}
        />
      )}
    </section>
  );
}
