"use client";

import React from 'react';
import { AuthGuard } from '@/components/providers/auth-guard';
import { ActivityList } from './activity-list';

export default function ActivityPage() {
  return (
    <AuthGuard message="Sign in to see your activity.">
      <div className="space-y-3 md:space-y-6 min-w-0">
        <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-1">
          <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
            <h1 className="text-2xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Activity</h1>
            <p className="text-sm md:text-lg text-muted-foreground mt-1 md:mt-0">
              Requests, mentions, and updates that need you.
            </p>
          </div>
        </header>

        <div className="space-y-4">
          <ActivityList />
        </div>
      </div>
    </AuthGuard>
  );
}
