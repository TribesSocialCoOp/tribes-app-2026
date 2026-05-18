"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Share2, Copy, Check, Loader2, Link2, Handshake, Users, ArrowRight, UserCheck, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";
import { createBondInviteLink, searchUsersForBonding } from '@/lib/actions/bond-actions';
import { getOrCreatePersonalInviteCode } from '@/lib/actions/profile-actions';
import { shareContent } from '@/lib/capacitor/share';
import { triggerHaptic } from '@/lib/capacitor/haptics';
import { ImpactStyle } from '@capacitor/haptics';
import { UserAvatar } from '@/components/ui/user-avatar';
import { BondRequestDialog } from './bond-request-dialog';

interface BondInviteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

type Tab = 'search' | 'link';

export function BondInviteDialog({ isOpen, onOpenChange }: BondInviteDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>('search');
  
  // Search tab state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Awaited<ReturnType<typeof searchUsersForBonding>>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  // Request Dialog state
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; avatarUrl?: string } | null>(null);
  const [isRequestOpen, setIsRequestOpen] = useState(false);

  // Link tab state
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // ============================================================
  // SEARCH METHOD
  // ============================================================
  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await searchUsersForBonding(query);
      setSearchResults(results);
    } catch (err: any) {
      console.error('[BondInviteDialog] search failed:', err);
      toast({ title: 'Search error', description: err.message || 'Failed to search users', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  }, [toast]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);

    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }

    debounceTimer.current = setTimeout(() => {
      performSearch(value);
    }, 350);
  };

  // ============================================================
  // LINK GENERATION METHOD
  // ============================================================
  const handleGenerateLink = async () => {
    setIsGenerating(true);
    triggerHaptic(ImpactStyle.Light);
    try {
      const [bondData, inviteCode] = await Promise.all([
        createBondInviteLink(),
        getOrCreatePersonalInviteCode().catch(() => ''),
      ]);

      const separator = bondData.url.includes('?') ? '&' : '?';
      const fullUrl = inviteCode
        ? `${bondData.url}${separator}invite=${inviteCode}`
        : bondData.url;

      setInviteUrl(fullUrl);
      toast({ title: 'Link generated!', description: 'You can now share this long-lived invite.' });
    } catch (err: any) {
      console.error('[BondInviteDialog] generate failed:', err);
      toast({ title: 'Error', description: err.message || 'Failed to generate invite link', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyLink = () => {
    if (!inviteUrl) return;
    triggerHaptic(ImpactStyle.Light);
    navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    toast({ title: 'Copied', description: 'Invite link copied to clipboard.' });
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareLink = async () => {
    if (!inviteUrl) return;
    triggerHaptic(ImpactStyle.Medium);
    const shared = await shareContent({
      title: 'Bond with me on Tribes',
      text: 'Open this link to create a secure cryptographic bond with me on Tribes.',
      url: inviteUrl,
    });
    if (!shared) {
      handleCopyLink();
    }
  };

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab('search');
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setInviteUrl(null);
      setCopied(false);
    }
  }, [isOpen]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimer.current) {
        clearTimeout(debounceTimer.current);
      }
    };
  }, []);

  const openRequestDialog = (user: { id: string; name: string; avatarUrl?: string }) => {
    triggerHaptic(ImpactStyle.Medium);
    setSelectedUser(user);
    setIsRequestOpen(true);
  };

  return (
    <>
      <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" />
            Invite to Bond
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Bonds are private cryptographic relationships. Create one to share posts with your Inner Circle.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        {/* Tab Controls */}
        <div className="flex p-1 bg-muted rounded-xl border border-border mx-6 mt-4">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'search'
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Search className="h-4 w-4" />
            Search Tribes
          </button>
          <button
            onClick={() => setActiveTab('link')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-4 rounded-lg text-sm font-semibold transition-all ${
              activeTab === 'link'
                ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Link2 className="h-4 w-4" />
            Share Invite Link
          </button>
        </div>

        {/* Dialog Content Container */}
        <div className="px-6 py-6 min-h-[300px]">
          {activeTab === 'search' ? (
            /* ================= SEARCH TAB ================= */
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by member name..."
                  value={searchQuery}
                  onChange={handleQueryChange}
                  className="pl-9 h-11 bg-background border-border text-foreground rounded-xl focus-visible:ring-primary/30"
                  autoFocus
                />
                {isSearching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>

              {/* Search results list */}
              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {isSearching && searchResults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground">Searching directory...</p>
                  </div>
                ) : searchResults.length > 0 ? (
                  searchResults.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/10 hover:bg-muted/30 transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <UserAvatar
                          user={{ name: user.name, avatar: user.avatarUrl }}
                          className="h-9 w-9 rounded-full border border-border"
                          fallback={user.name.substring(0, 2).toUpperCase()}
                        />
                        <div>
                          <p className="text-sm font-semibold text-foreground leading-none">{user.name}</p>
                          <p className="text-xs text-muted-foreground mt-1">Tribes Member</p>
                        </div>
                      </div>

                      {user.status === 'bonded' ? (
                        <div className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full">
                          <UserCheck className="h-3 w-3" />
                          Bonded
                        </div>
                      ) : user.status === 'pending' ? (
                        <div className="flex items-center gap-1 text-xs font-semibold text-yellow-400 bg-yellow-400/10 px-2.5 py-1 rounded-full">
                          <Clock className="h-3 w-3" />
                          Pending
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => openRequestDialog(user)}
                          className="h-8 px-3 rounded-lg bg-primary hover:bg-primary/95 text-white font-medium text-xs flex items-center gap-1"
                        >
                          Bond
                          <ArrowRight className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))
                ) : hasSearched ? (
                  <div className="text-center py-12">
                    <Users className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
                    <p className="text-sm font-medium text-muted-foreground">No members found</p>
                    <p className="text-xs text-muted-foreground/80 mt-1">Try checking the spelling or name.</p>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Handshake className="h-10 w-10 text-primary/30 mx-auto mb-2" />
                    <p className="text-xs text-muted-foreground max-w-[200px] mx-auto leading-relaxed">
                      Type the name of any member on Tribes to request a secure cryptographic bond.
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================= LINK TAB ================= */
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              {inviteUrl ? (
                <div className="w-full space-y-4">
                  <div className="relative p-4 rounded-xl border border-border bg-muted/20 flex items-center justify-center gap-3">
                    <Link2 className="h-5 w-5 text-primary shrink-0" />
                    <code className="text-xs font-mono text-foreground break-all select-all pr-2 max-w-full block">
                      {inviteUrl}
                    </code>
                  </div>

                  <div className="grid grid-cols-2 gap-3 w-full max-w-xs mx-auto">
                    <Button
                      variant="outline"
                      onClick={handleCopyLink}
                      className="h-12 rounded-xl border-border text-foreground hover:bg-muted/50"
                    >
                      {copied ? <Check className="mr-2 h-4 w-4 text-green-400" /> : <Copy className="mr-2 h-4 w-4" />}
                      {copied ? 'Copied' : 'Copy'}
                    </Button>
                    <Button
                      onClick={handleShareLink}
                      className="h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20"
                    >
                      <Share2 className="mr-2 h-4 w-4" /> Share
                    </Button>
                  </div>

                  <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground mt-2 bg-primary/10 py-1.5 px-3 rounded-full w-fit mx-auto font-medium">
                    <Clock className="h-3.5 w-3.5 text-primary" />
                    Valid for 1 calendar year (secure, single-use)
                  </div>
                </div>
              ) : (
                <div className="py-6 space-y-4 w-full">
                  <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto text-primary">
                    <Link2 className="h-6 w-6" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">Generate Invite Link</p>
                    <p className="text-xs text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
                      Creates a single-use cryptographic invite link you can send to anyone via text, email, or social media.
                    </p>
                  </div>
                  <Button
                    onClick={handleGenerateLink}
                    disabled={isGenerating}
                    className="h-11 px-8 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 mt-2 w-full max-w-xs"
                  >
                    {isGenerating ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Link2 className="mr-2 h-4 w-4" />
                    )}
                    {isGenerating ? 'Generating...' : 'Generate Invite Link'}
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>

        <ResponsiveDialogFooter className="bg-muted/30 -mx-6 -mb-6 p-6 sm:mx-0 sm:mb-0 sm:rounded-b-lg">
          <div className="w-full text-center space-y-1">
            <p className="text-xs font-semibold text-foreground flex items-center justify-center gap-1.5">
              <Handshake className="h-3.5 w-3.5 text-primary" />
              Direct End-to-End Cryptographic Bonding
            </p>
            <p className="text-[10px] text-muted-foreground">
              Bonds create secure keys stored directly in your browser or device for maximum privacy.
            </p>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialog>

      {/* Renders the secondary Request Dialog when bonding from search */}
      {selectedUser && (
        <BondRequestDialog
          isOpen={isRequestOpen}
          onOpenChange={(open) => {
            setIsRequestOpen(open);
            if (!open) setSelectedUser(null);
          }}
          targetUserId={selectedUser.id}
          targetUserName={selectedUser.name}
          targetUserAvatar={selectedUser.avatarUrl}
          onSuccess={() => {
            // Refresh local search matches to show the updated status
            performSearch(searchQuery);
          }}
        />
      )}
    </>
  );
}
