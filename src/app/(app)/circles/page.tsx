"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, Link2, Loader2, PlusCircle, Tent, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { getMyTribesList } from '@/lib/actions/content-actions';
import { useUser } from '@/hooks/use-user';
import { TribeCard, type TribeCardData } from '@/components/cards/tribe-card';
import { ViewToggle, getPersistedViewMode, type ViewMode } from '@/components/ui/view-toggle';

// Embed the full bonds infrastructure
import { BondsProvider, useBonds } from '../bonds/bonds-context';
import { BondSettingsDialog } from '@/components/dialogs/bond-settings-dialog';
import { IntroductionDialog } from '@/components/dialogs/introduction-dialog';
import { BondPendingRequests } from '../bonds/bond-pending-requests';
import { BondFamilyCapacity } from '../bonds/bond-family-capacity';
import { BondTable } from '../bonds/bond-table';

export default function CirclesPage() {
  return (
    <BondsProvider>
      <CirclesContent />
    </BondsProvider>
  );
}

function CirclesContent() {
  const [activeTab, setActiveTab] = useState<'bonds' | 'tribes'>('bonds');
  const [tribes, setTribes] = useState<TribeCardData[]>([]);
  const [tribesLoading, setTribesLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');

  // Access bonds context for counts + dialogs
  const { state: bondsState, dispatch, handleSaveBondSettings, handleConfirmIntroduction } = useBonds();

  useEffect(() => {
    setViewMode(getPersistedViewMode());
    async function fetchTribes() {
      try {
        const tribesResult = await getMyTribesList();
        setTribes(tribesResult);
      } catch (err) {
        console.error('[CirclesPage] Failed to fetch tribes:', err);
      } finally {
        setTribesLoading(false);
      }
    }
    fetchTribes();
  }, []);

  const filteredTribes = tribes.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const bondsCount = bondsState.bonds?.length ?? 0;

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-normal text-foreground font-mono">Circles</h1>
          <p className="text-md md:text-lg text-muted-foreground mt-1">
            Your bonds and tribes — all your people in one place.
          </p>
        </div>
        {activeTab === 'tribes' && (
          <ViewToggle value={viewMode} onChange={setViewMode} className="mt-2" />
        )}
      </header>

      {/* Tab Switcher */}
      <div className="flex gap-1 p-1 bg-muted/50 rounded-lg w-fit">
        <button
          onClick={() => setActiveTab('bonds')}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all",
            activeTab === 'bonds'
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Link2 className="inline-block mr-1.5 h-4 w-4" /> Bonds
          <Badge variant="secondary" className="ml-1.5 text-xs">{bondsCount}</Badge>
        </button>
        <button
          onClick={() => setActiveTab('tribes')}
          className={cn(
            "px-4 py-2 rounded-md text-sm font-medium transition-all",
            activeTab === 'tribes'
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Tent className="inline-block mr-1.5 h-4 w-4" /> Tribes
          <Badge variant="secondary" className="ml-1.5 text-xs">{tribes.length}</Badge>
        </button>
      </div>

      {/* ── Bonds Tab: Full bond management ── */}
      {activeTab === 'bonds' && (
        <div className="space-y-6">
          {bondsState.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <BondPendingRequests />
              <BondFamilyCapacity />
              <BondTable />
            </>
          )}
        </div>
      )}

      {/* ── Tribes Tab ── */}
      {activeTab === 'tribes' && (
        <div className="space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search tribes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          {tribesLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredTribes.length > 0 ? (
            <div className={cn(
              viewMode === 'grid'
                ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
                : "space-y-2"
            )}>
              {filteredTribes.map(tribe => (
                <TribeCard key={tribe.id} tribe={tribe} view={viewMode} />
              ))}
            </div>
          ) : (
            <Card className="text-center py-8 shadow-none border-dashed">
              <CardContent className="p-4">
                <Tent className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
                <p className="text-muted-foreground text-sm">
                  {searchQuery ? 'No tribes match your search.' : 'You haven\'t joined any tribes yet.'}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="text-center">
            <Link href="/discover">
              <Button variant="outline" size="sm">
                <PlusCircle className="mr-2 h-4 w-4" /> Discover Tribes
              </Button>
            </Link>
          </div>
        </div>
      )}

      {/* Dialogs from bonds infrastructure */}
      {bondsState.settingsDialog.bond && (
        <BondSettingsDialog
          isOpen={bondsState.settingsDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_SETTINGS' })}
          bond={bondsState.settingsDialog.bond}
          onSave={handleSaveBondSettings}
        />
      )}
      {bondsState.introductionDialog.bond && bondsState.bonds && (
        <IntroductionDialog
          isOpen={bondsState.introductionDialog.open}
          onOpenChange={(open) => !open && dispatch({ type: 'CLOSE_INTRODUCTION' })}
          introducingBond={bondsState.introductionDialog.bond}
          allBonds={bondsState.bonds}
          onConfirmIntroduction={handleConfirmIntroduction}
        />
      )}
    </div>
  );
}
