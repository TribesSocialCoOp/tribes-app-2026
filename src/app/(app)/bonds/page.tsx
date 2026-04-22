
"use client";

import React from 'react';
import { Link2, Loader2 } from "lucide-react";
import { BondSettingsDialog } from '@/components/dialogs/bond-settings-dialog';
import { IntroductionDialog } from '@/components/dialogs/introduction-dialog';
import { BondsProvider, useBonds } from './bonds-context';
import { BondPendingRequests } from './bond-pending-requests';
import { BondFamilyCapacity } from './bond-family-capacity';
import { BondTable } from './bond-table';

function BondsContent() {
  const { state, dispatch, handleSaveBondSettings, handleConfirmIntroduction } = useBonds();

  if (state.isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-var(--header-height,4rem)-2rem)]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header className="mb-8">
        <div className="flex items-center space-x-3 mb-2">
          <Link2 className="h-10 w-10 text-primary" />
          <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Manage Bonds</h1>
        </div>
        <p className="text-lg text-muted-foreground mt-1">
          Oversee connections, manage passkeys, pseudonyms, and family bonds.
        </p>
      </header>

      <BondPendingRequests />
      <BondFamilyCapacity />
      <BondTable />

      {state.settingsDialog.bond && (
        <BondSettingsDialog
          isOpen={state.settingsDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_SETTINGS' })}
          bond={state.settingsDialog.bond}
          onSave={handleSaveBondSettings}
        />
      )}
      {state.introductionDialog.bond && state.bonds && (
        <IntroductionDialog
          isOpen={state.introductionDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_INTRODUCTION' })}
          introducingBond={state.introductionDialog.bond}
          allBonds={state.bonds}
          onConfirmIntroduction={handleConfirmIntroduction}
        />
      )}
    </div>
  );
}

export default function BondsPage() {
  return (
    <BondsProvider>
      <BondsContent />
    </BondsProvider>
  );
}
