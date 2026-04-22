"use client";

import React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from '@/components/ui/button';
import { MessageSquareText, HeartHandshake, Users, Rss, Loader2 } from "lucide-react";
import { useIntercom } from './intercom-context';
import { IntercomFeedItem } from './intercom-feed-item';

export function IntercomFeedTab() {
  const { state, familyComms, regularComms, highlightsFromYourMoods } = useIntercom();

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6">
      {familyComms.length > 0 && (
        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-foreground mt-6 mb-3 flex items-center tracking-normal">
            <HeartHandshake className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6 text-pink-500" /> Family Bond Updates
          </h2>
          <div className="space-y-4">
            {familyComms.map(item => <IntercomFeedItem key={item.id} item={item} />)}
          </div>
        </section>
      )}
      {regularComms.length > 0 && (
        <section>
          <h2 className="text-xl md:text-2xl font-semibold text-foreground mt-6 mb-3 flex items-center tracking-normal">
            <Users className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6 text-primary" /> Your Bonds
          </h2>
          <div className="space-y-4">
            {regularComms.map(item => <IntercomFeedItem key={item.id} item={item} />)}
          </div>
        </section>
      )}
      <section>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-6 mb-3 gap-2">
          <h2 className="text-xl md:text-2xl font-semibold text-foreground flex items-center tracking-normal">
            <Rss className="mr-2 md:mr-3 h-5 w-5 md:h-6 md:w-6 text-accent" /> Highlights from Your Moods
          </h2>
        </div>
        {highlightsFromYourMoods.length > 0 ? (
          <div className="space-y-4">
            {highlightsFromYourMoods.map(item => <IntercomFeedItem key={item.id} item={item} />)}
          </div>
        ) : (
          <Card className="text-center py-8 shadow-none border border-dashed">
            <CardContent className="p-4">
              <Rss className="mx-auto h-10 w-10 text-muted-foreground opacity-60 mb-3" />
              <p className="text-muted-foreground">
                {(state.selectedMoodSlugs.length > 0 || !state.hasLoadedFromStorage) ? "No posts from your selected moods yet." : "Select some moods to see highlights here!"}
              </p>
              {(state.selectedMoodSlugs.length === 0 && state.hasLoadedFromStorage) && (
                <Button variant="link" onClick={() => {/* tuner handled by parent */}} className="mt-1">
                  Tune Your Feed
                </Button>
              )}
            </CardContent>
          </Card>
        )}
        <CardFooter className="pt-6 justify-center">
          <Link href="/moods" passHref>
            <Button variant="link">Explore All Mood Streams</Button>
          </Link>
        </CardFooter>
      </section>
      {state.allCommsData.length === 0 && (
        <Card className="text-center py-12 shadow-none sm:shadow-lg">
          <CardContent className="p-4 sm:p-6">
            <MessageSquareText className="mx-auto h-12 w-12 sm:h-16 sm:w-16 text-muted-foreground opacity-50 mb-4 sm:mb-6" />
            <h3 className="text-lg sm:text-xl font-semibold text-foreground mb-2 tracking-normal">It's quiet in here...</h3>
            <p className="text-muted-foreground text-sm sm:text-base">
              Your communications feed is empty. Connect with friends, join tribes, or explore mood streams to get started!
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
