
"use client";

import React, { useState } from 'react';
import { Link2, Loader2, QrCode, Search, Share2 } from "lucide-react";
import Link from 'next/link';
import { useToast } from '@/hooks/use-toast';
import { createBondInviteLink } from '@/lib/actions/bond-actions';
import { getOrCreatePersonalInviteCode } from '@/lib/actions/profile-actions';
import { BondSettingsDialog } from '@/components/dialogs/bond-settings-dialog';
import { IntroductionDialog } from '@/components/dialogs/introduction-dialog';
import { BondQRDialog } from '@/components/dialogs/bond-qr-dialog';
import { BondsProvider, useBonds } from './bonds-context';
import { BondPendingRequests } from './bond-pending-requests';
import { BondFamilyCapacity } from './bond-family-capacity';
import { BondTable } from './bond-table';
import { RecentChats } from '@/components/circles/recent-chats';
import { Button } from '@/components/ui/button';
import { ShareLinkCard } from '@/components/ui/share-link-card';

function BondsContent() {
  const { state, dispatch, handleSaveBondSettings, handleConfirmIntroduction } = useBonds();
  const [showQRDialog, setShowQRDialog] = useState(false);
  const [shareLink, setShareLink] = useState<string | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const { toast } = useToast();

  const handleGenerateInvite = async () => {
    setIsGeneratingLink(true);
    try {
      const [data, inviteCode] = await Promise.all([
        createBondInviteLink(),
        getOrCreatePersonalInviteCode(),
      ]);
      // Embed the invite code into the bond URL
      const separator = data.url.includes('?') ? '&' : '?';
      setShareLink(`${data.url}${separator}invite=${inviteCode}`);
      toast({ title: 'Invite link generated', description: 'Share it with someone to bond!' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Failed to generate invite link', variant: 'destructive' });
    } finally {
      setIsGeneratingLink(false);
    }
  };

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
            onClick={() => setShowQRDialog(true)}
            className="bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 h-11 px-6 rounded-xl"
          >
            <QrCode className="mr-2 h-4 w-4" /> Bond in Person
          </Button>
          <Button 
            variant="outline" 
            onClick={handleGenerateInvite}
            disabled={isGeneratingLink}
            className="h-11 px-6 rounded-xl border-primary/20 hover:bg-primary/5 hover:text-primary transition-all"
          >
            {isGeneratingLink ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Share2 className="mr-2 h-4 w-4" />}
            Invite to Bond
          </Button>
          <Link href="/search">
            <Button variant="ghost" className="h-11 px-6 rounded-xl text-muted-foreground hover:text-foreground">
              <Search className="mr-2 h-4 w-4" /> Find People
            </Button>
          </Link>
        </div>
        
        {shareLink && (
          <div className="mt-4">
            <ShareLinkCard
              url={shareLink}
              title="Bond with me on Tribes"
              expiryLabel="Expires in 5 minutes"
              onDismiss={() => setShareLink(null)}
            />
          </div>
        )}
      </header>

      <RecentChats />
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
