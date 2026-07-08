"use client";

import React from 'react';
import { IntercomProvider, useIntercom } from './intercom-context';
import { IntercomFeedTab } from './intercom-feed-tab';
import { ComposeBox } from '@/components/compose/compose-box';
import { AuthGuard } from '@/components/providers/auth-guard';
import { EditPostDialog } from '@/components/dialogs/edit-post-dialog';

function IntercomContent() {
  const { state, dispatch, refreshFeed } = useIntercom();

  return (
    <div className="space-y-3 md:space-y-6 min-w-0">
      <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
          <h1 className="text-2xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Feed</h1>
          <p className="text-sm md:text-lg text-muted-foreground mt-1 md:mt-0">
            Your world, tuned your way.
          </p>
        </div>
      </header>

      {/* Universal Compose */}
      <ComposeBox
        onPostCreated={refreshFeed}
        defaultRing={state.ringFilter === 'all' || state.ringFilter === 'streams' ? undefined : state.ringFilter}
      />

      <IntercomFeedTab />

      {/* Edit Dialog */}
      <EditPostDialog
        open={state.editPostDialog.open}
        onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_EDIT_POST' })}
        post={state.editPostDialog.target as any}
        onSuccess={refreshFeed}
      />
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
