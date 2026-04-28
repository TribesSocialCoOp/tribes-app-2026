"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { MessageSquareText, Loader2, BookLock, PenLine } from "lucide-react";
import { useIntercom } from './intercom-context';
import { IntercomFeedItem } from './intercom-feed-item';
import { RingFilterBar } from '@/components/feed/ring-filter-bar';
import { MoodFilterBar } from '@/components/feed/mood-filter-bar';
import { usePostDecryption } from '@/hooks/use-post-decryption';

export function IntercomFeedTab() {
  const { state, feedItems, setRingFilter, setMoodSlugs } = useIntercom();

  // Decrypt encrypted posts client-side (E2E)
  const { getContent, isDecrypting } = usePostDecryption(feedItems);

  // Merge decrypted content into feed items
  const decryptedFeedItems = useMemo(() =>
    feedItems.map(item => {
      if (!item.isEncrypted) return item;
      const content = getContent(item);
      return { ...item, content };
    }),
    [feedItems, getContent],
  );

  return (
    <div className="space-y-4 min-w-0">
      {/* Ring Filter Bar */}
      <RingFilterBar
        value={state.ringFilter}
        onChange={setRingFilter}
      />

      {/* Mood Filter Bar */}
      <MoodFilterBar
        selectedSlugs={state.selectedMoodSlugs}
        onChange={setMoodSlugs}
        className="mt-1"
      />

      {/* Loading */}
      {state.isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
        </div>
      )}

      {/* Feed Items */}
      {!state.isLoading && decryptedFeedItems.length > 0 && (
        <div className="space-y-4 mt-4">
          {isDecrypting && (
            <p className="text-xs text-muted-foreground text-center animate-pulse">🔓 Decrypting posts...</p>
          )}
          {decryptedFeedItems.map(item => (
            <IntercomFeedItem key={item.id} item={item} />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!state.isLoading && decryptedFeedItems.length === 0 && (
        <Card className="text-center py-12 shadow-none border border-dashed mt-4">
          <CardContent className="p-4 sm:p-6">
            {state.ringFilter === 'journal' ? (
              <>
                <BookLock className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2 tracking-normal">Your Journal is empty</h3>
                <p className="text-muted-foreground text-sm">
                  Write your first journal entry — it&apos;s private and only visible to you.
                </p>
              </>
            ) : state.ringFilter === 'inner_circle' ? (
              <>
                <PenLine className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2 tracking-normal">Nothing from your Inner Circle yet</h3>
                <p className="text-muted-foreground text-sm">
                  Add bonds to your Inner Circle from{' '}
                  <Link href="/bonds" className="text-primary hover:underline">Bond settings</Link>.
                </p>
              </>
            ) : (
              <>
                <MessageSquareText className="mx-auto h-12 w-12 text-muted-foreground opacity-50 mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2 tracking-normal">It&apos;s quiet in here...</h3>
                <p className="text-muted-foreground text-sm">
                  {state.selectedMoodSlugs.length > 0
                    ? 'No posts match your mood filters. Try selecting different moods or removing filters.'
                    : 'Your feed is empty. Connect with friends, join tribes, or explore mood streams to get started!'
                  }
                </p>
                {state.selectedMoodSlugs.length > 0 && (
                  <Button
                    variant="link"
                    className="mt-2"
                    onClick={() => setMoodSlugs([])}
                  >
                    Clear mood filters
                  </Button>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
