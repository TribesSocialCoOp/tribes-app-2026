"use client";

import React, { useMemo } from 'react';
import Link from 'next/link';
import { Card, CardContent } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { MessageSquareText, Loader2, BookLock, PenLine, KeyRound } from "lucide-react";
import { useIntercom } from './intercom-context';
import { IntercomFeedItem } from './intercom-feed-item';
import { RingFilterBar } from '@/components/feed/ring-filter-bar';
import { MoodFilterBar } from '@/components/feed/mood-filter-bar';
import { usePostDecryption } from '@/hooks/use-post-decryption';
import { useKeySync } from '@/components/providers/key-sync-provider';
import { useScrollToPost } from '@/hooks/use-scroll-to-post';

export function IntercomFeedTab() {
  const { state, feedItems, setRingFilter, setMoodSlugs } = useIntercom();
  const { orphanedBondCount } = useKeySync();

  // Decrypt encrypted posts client-side (E2E)
  const { getContent, getTitle, isDecrypting } = usePostDecryption(feedItems);

  // Deep-link: scroll to a specific post when ?postId=<id> or ?post=<id> is present
  useScrollToPost([feedItems.length]);

  // Merge decrypted content + title into feed items so all downstream
  // `item.title` / `item.content` usages render the decrypted values.
  const decryptedFeedItems = useMemo(() =>
    feedItems.map(item => {
      if (!item.isEncrypted) return item;
      return { ...item, content: getContent(item), title: getTitle(item) };
    }),
    [feedItems, getContent, getTitle],
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

      {/* Orphaned Bond Notice — points to Key Sync Banner and Settings */}
      {orphanedBondCount > 0 && (
        <Alert variant="default" className="bg-amber-500/10 border-amber-500/50 text-amber-700 dark:text-amber-400 mt-4">
          <KeyRound className="h-5 w-5 !text-amber-500" />
          <AlertTitle className="font-semibold">Encryption Keys Missing on This Device</AlertTitle>
          <AlertDescription className="text-sm mt-1 leading-relaxed">
            <p>
              {orphanedBondCount} {orphanedBondCount === 1 ? 'bond was' : 'bonds were'} encrypted
              on another device. Sync your keys from the banner above, or go to{' '}
              <Link href="/settings" className="text-primary hover:underline font-medium">Settings &gt; Key Vault</Link>{' '}
              to restore from a backup.
            </p>
          </AlertDescription>
        </Alert>
      )}

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
