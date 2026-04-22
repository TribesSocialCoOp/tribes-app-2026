
"use client";

import React from 'react';
import { Loader2 } from "lucide-react";
import { TribeDetailProvider, useTribeDetail } from './tribe-detail-context';
import { TribeAdminDashboard } from './tribe-admin-dashboard';
import { TribeHeroBanner } from './tribe-hero-banner';
import { TribeFeedSection } from './tribe-feed-section';
import { TribeDialogOrchestrator } from './tribe-dialog-orchestrator';

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
    <div className="space-y-6 pb-12">
      <TribeAdminDashboard />
      <TribeHeroBanner />
      <TribeFeedSection />
      <TribeDialogOrchestrator />
    </div>
  );
}

export default function TribeDetailPage() {
  return (
    <TribeDetailProvider>
      <TribeDetailContent />
    </TribeDetailProvider>
  );
}
