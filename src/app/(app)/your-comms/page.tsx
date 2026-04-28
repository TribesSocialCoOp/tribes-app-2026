"use client";

import React from 'react';
import { Rss, Bell } from "lucide-react";
import { Badge } from '@/components/ui/badge';
import { IntercomProvider, useIntercom } from './intercom-context';
import { IntercomFeedTab } from './intercom-feed-tab';
import { IntercomActivityTab } from './intercom-activity-tab';
import { ComposeBox } from '@/components/compose/compose-box';
import { AuthGuard } from '@/components/providers/auth-guard';

function IntercomContent() {
  const { state, dispatch, activityCount, refreshFeed } = useIntercom();

  return (
    <div className="space-y-3 md:space-y-6 min-w-0">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Feed</h1>
          <p className="text-sm md:text-lg text-muted-foreground mt-1">
            Your world, tuned your way.
          </p>
        </div>
      </header>

      {/* Universal Compose */}
      {state.activeTab === 'feed' && (
        <ComposeBox
          onPostCreated={refreshFeed}
          defaultRing={state.ringFilter === 'all' || state.ringFilter === 'streams' ? undefined : state.ringFilter}
        />
      )}

      {/* Tab Bar */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg max-w-full overflow-x-auto scrollbar-none">
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
    <AuthGuard message="Sign in to access your encrypted communication feed.">
      <IntercomProvider>
        <IntercomContent />
      </IntercomProvider>
    </AuthGuard>
  );
}
