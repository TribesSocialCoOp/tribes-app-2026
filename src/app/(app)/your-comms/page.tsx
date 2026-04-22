"use client";

import React from 'react';
import { Rss, Bell, Filter as FilterIcon } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { PlusCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { IntercomProvider, useIntercom } from './intercom-context';
import { IntercomFeedTab } from './intercom-feed-tab';
import { IntercomActivityTab } from './intercom-activity-tab';

function IntercomContent() {
  const { state, dispatch, activityCount, allMoods } = useIntercom();

  return (
    <div className="space-y-6 md:space-y-8">
      <header className="mb-4 md:mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Intercom</h1>
          <p className="text-md md:text-lg text-muted-foreground mt-1 md:mt-2">
            Catch up on messages from your bonds and the latest in your mood streams.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {state.activeTab === 'feed' && (
            <Popover open={state.isTunerOpen} onOpenChange={(open) => dispatch({ type: 'SET_TUNER_OPEN', payload: open })}>
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <FilterIcon className="mr-2 h-4 w-4" /> Tune Feed
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0 max-h-[75vh] flex flex-col">
                <div className="p-4 border-b">
                  <h4 className="font-medium leading-none text-sm">Tune Your Intercom</h4>
                  <p className="text-xs text-muted-foreground mt-1">
                    Select sources to include in your "Highlights" feed.
                  </p>
                </div>
                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground mb-2">Filter by Moods:</p>
                    <div className="space-y-2 pl-1">
                      {allMoods.map(mood => (
                        <div key={mood.slug} className="flex items-center space-x-2">
                          <Checkbox
                            id={`mood-check-${mood.slug}`}
                            checked={state.selectedMoodSlugs.includes(mood.slug)}
                            onCheckedChange={(checked) => dispatch({ type: 'TOGGLE_MOOD', payload: { slug: mood.slug, checked: !!checked } })}
                          />
                          <Label htmlFor={`mood-check-${mood.slug}`} className="text-sm font-normal cursor-pointer flex items-center">
                            <span className="mr-1.5 text-base">{mood.emoji}</span> {mood.name}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground mb-2">Your Custom Streams:</p>
                    <p className="text-xs text-muted-foreground p-2 text-center bg-muted/50 rounded-md">
                      Soon you'll be able to create and select custom streams combining your favorite tribes and moods!
                    </p>
                    <Button variant="outline" size="sm" className="w-full mt-2" disabled>
                      <PlusCircle className="mr-2 h-4 w-4" />
                      Create New Custom Stream
                    </Button>
                  </div>
                </ScrollArea>
                <div className="p-4 border-t">
                  <Button size="sm" onClick={() => dispatch({ type: 'SET_TUNER_OPEN', payload: false })} className="w-full">Done</Button>
                </div>
              </PopoverContent>
            </Popover>
          )}
        </div>
      </header>

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit mb-6">
        <button
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'feed' })}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
            state.activeTab === 'feed'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Rss className="inline-block mr-1.5 h-4 w-4" /> Feed
        </button>
        <button
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'activity' })}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-1.5 ${
            state.activeTab === 'activity'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Bell className="h-4 w-4" /> Activity
          {activityCount > 0 && (
            <Badge variant="destructive" className="h-5 min-w-[20px] px-1.5 text-[10px] font-bold">
              {activityCount > 9 ? '9+' : activityCount}
            </Badge>
          )}
        </button>
      </div>

      {state.activeTab === 'feed' && <IntercomFeedTab />}
      {state.activeTab === 'activity' && (
        <div className="space-y-4">
          <IntercomActivityTab />
        </div>
      )}
    </div>
  );
}

export default function YourCommsPage() {
  return (
    <IntercomProvider>
      <IntercomContent />
    </IntercomProvider>
  );
}
