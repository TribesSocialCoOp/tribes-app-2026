"use client";

import React from 'react';
import { Loader2 } from "lucide-react";
import { TribeDetailProvider, useTribeDetail } from '@/app/(app)/tribes/[tribeId]/tribe-detail-context';
import { TribeAdminDashboard } from '@/app/(app)/tribes/[tribeId]/tribe-admin-dashboard';
import { TribeHeroBanner } from '@/app/(app)/tribes/[tribeId]/tribe-hero-banner';
import { TribeFeedSection } from '@/app/(app)/tribes/[tribeId]/tribe-feed-section';
import { TribeDialogOrchestrator } from '@/app/(app)/tribes/[tribeId]/tribe-dialog-orchestrator';

function TribeDetailContent() {
  const { state } = useTribeDetail();

  if (state.isLoading || !state.tribe) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-0">
      <TribeAdminDashboard />
      <TribeHeroBanner />
      <TribeFeedSection />
      <TribeDialogOrchestrator />
    </div>
  );
}

export default function TribeSlugClient() {
  return (
    <TribeDetailProvider>
      <TribeDetailContent />
    </TribeDetailProvider>
  );
}
