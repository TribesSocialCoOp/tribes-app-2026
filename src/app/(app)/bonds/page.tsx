
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
      <header className="mb-8 flex flex-col md:flex-row md:items-baseline md:gap-3">
        <h1 className="text-2xl sm:text-4xl font-bold tracking-normal text-foreground font-mono flex items-center gap-3">
          <Link2 className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
          Manage Bonds
        </h1>
        <p className="text-lg text-muted-foreground mt-1 md:mt-0">
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

import { AuthGuard } from '@/components/providers/auth-guard';

export default function BondsPage() {
  return (
    <AuthGuard message="Sign in to manage your connections, passkeys, and family bonds.">
      <BondsProvider>
        <BondsContent />
      </BondsProvider>
    </AuthGuard>
  );
}
