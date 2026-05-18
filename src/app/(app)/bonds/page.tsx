
"use client";

import React, { useState } from 'react';
import { Link2, Loader2, Handshake, Share2, QrCode } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { BondSettingsDialog } from '@/components/dialogs/bond-settings-dialog';
import { IntroductionDialog } from '@/components/dialogs/introduction-dialog';
import { BondQRDialog } from '@/components/dialogs/bond-qr-dialog';
import { BondInviteDialog } from '@/components/dialogs/bond-invite-dialog';
import { TapToBondScreen } from '@/components/bond/tap-to-bond-screen';
import { isNative } from '@/lib/capacitor/platform';
import { BondsProvider, useBonds } from './bonds-context';
import { BondPendingRequests } from './bond-pending-requests';
import { BondFamilyCapacity } from './bond-family-capacity';
import { BondTable } from './bond-table';
import { Button } from '@/components/ui/button';

function BondsContent() {
  const { state, dispatch, handleSaveBondSettings, handleConfirmIntroduction } = useBonds();
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [showInviteDialog, setShowInviteDialog] = useState(false);
  const [showTapScreen, setShowTapScreen] = useState(false);
  const [displayName, setDisplayName] = useState('Tribes User');
  const { toast } = useToast();

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
        <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
          <h1 className="text-2xl sm:text-4xl font-bold tracking-normal text-foreground font-mono flex items-center gap-3">
            <Link2 className="h-8 w-8 sm:h-10 sm:w-10 text-primary" />
            Manage Bonds
          </h1>
          <p className="text-lg text-muted-foreground mt-1 md:mt-0">
            Oversee connections, manage passkeys, pseudonyms, and family bonds.
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button 
            onClick={() => isNative ? setShowTapScreen(true) : setShowQRDialog(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 h-11 px-6 rounded-xl"
          >
            {isNative ? <Handshake className="mr-2 h-4 w-4" /> : <QrCode className="mr-2 h-4 w-4" />}
            Bond in Person
          </Button>
          <Button 
            variant="outline" 
            onClick={() => setShowInviteDialog(true)}
            className="h-11 px-6 rounded-xl border-primary/20 hover:bg-primary/5 hover:text-primary transition-all"
          >
            <Share2 className="mr-2 h-4 w-4" />
            Invite to Bond
          </Button>
        </div>
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
      <BondQRDialog 
        isOpen={showQRDialog} 
        onOpenChange={setShowQRDialog} 
      />
      <BondInviteDialog
        isOpen={showInviteDialog}
        onOpenChange={setShowInviteDialog}
      />
      <TapToBondScreen
        isOpen={showTapScreen}
        onClose={() => setShowTapScreen(false)}
        displayName={displayName}
      />
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
