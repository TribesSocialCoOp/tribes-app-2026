"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Search, Loader2, Users, UserPlus, ArrowRight, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import {
  ResponsiveDialog, ResponsiveDialogHeader, ResponsiveDialogTitle,
  ResponsiveDialogDescription, ResponsiveDialogFooter
} from "@/components/ui/responsive-dialog";
import { searchUsersForTribeInvite, sendTribeInvite } from '@/lib/actions/tribe-actions';
import { UserAvatar } from '@/components/ui/user-avatar';
import { triggerHaptic } from '@/lib/capacitor/haptics';
import { ImpactStyle } from '@capacitor/haptics';

interface TribeInviteDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  tribeId: string;
  tribeName: string;
}

type SearchResult = Awaited<ReturnType<typeof searchUsersForTribeInvite>>[number];

export function TribeInviteDialog({ isOpen, onOpenChange, tribeId, tribeName }: TribeInviteDialogProps) {
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const debounceTimer = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(async (query: string) => {
    if (!query.trim() || query.trim().length < 2) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }
    setIsSearching(true);
    setHasSearched(true);
    try {
      const results = await searchUsersForTribeInvite(tribeId, query);
      setSearchResults(results);
    } catch (err: any) {
      console.error('[TribeInviteDialog] search failed:', err);
      toast({ title: 'Search error', description: err.message || 'Failed to search users', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  }, [tribeId, toast]);

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => performSearch(value), 350);
  };

  const handleInvite = async (user: SearchResult) => {
    setSendingId(user.id);
    triggerHaptic(ImpactStyle.Medium);
    try {
      await sendTribeInvite(tribeId, user.id);
      setSentIds(prev => new Set(prev).add(user.id));
      toast({ title: 'Invite sent', description: `${user.name} has been invited to join ${tribeName}.` });
    } catch (err: any) {
      toast({ title: 'Could not send invite', description: err.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setSendingId(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setHasSearched(false);
      setSentIds(new Set());
    }
  }, [isOpen]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={onOpenChange}>
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-primary" />
          Invite to {tribeName}
        </ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Search for a member on Tribes and send them a direct invite to join this tribe.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>

      <div className="px-6 py-6 min-h-[300px] space-y-4">
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

        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {isSearching && searchResults.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Searching directory...</p>
            </div>
          ) : searchResults.length > 0 ? (
            searchResults.map((user) => {
              const justSent = sentIds.has(user.id);
              return (
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

                  {user.status === 'member' ? (
                    <div className="flex items-center gap-1 text-xs font-semibold text-green-400 bg-green-400/10 px-2.5 py-1 rounded-full">
                      <Check className="h-3 w-3" />
                      Member
                    </div>
                  ) : justSent || user.status === 'invited' ? (
                    <div className="flex items-center gap-1 text-xs font-semibold text-yellow-400 bg-yellow-400/10 px-2.5 py-1 rounded-full">
                      <Clock className="h-3 w-3" />
                      Invited
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleInvite(user)}
                      disabled={sendingId === user.id}
                      className="h-8 px-3 rounded-lg bg-primary hover:bg-primary/95 text-white font-medium text-xs flex items-center gap-1"
                    >
                      {sendingId === user.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <>
                          Invite
                          <ArrowRight className="h-3 w-3" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              );
            })
          ) : hasSearched ? (
            <div className="text-center py-12">
              <Users className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">No members found</p>
              <p className="text-xs text-muted-foreground/80 mt-1">Try checking the spelling or name.</p>
            </div>
          ) : (
            <div className="text-center py-12">
              <UserPlus className="h-10 w-10 text-primary/30 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground max-w-[240px] mx-auto leading-relaxed">
                Type the name of any member on Tribes to invite them to {tribeName}.
              </p>
            </div>
          )}
        </div>
      </div>

      <ResponsiveDialogFooter className="bg-muted/30 -mx-6 -mb-6 p-6 sm:mx-0 sm:mb-0 sm:rounded-b-lg">
        <div className="w-full text-center space-y-1">
          <p className="text-xs font-semibold text-foreground flex items-center justify-center gap-1.5">
            <UserPlus className="h-3.5 w-3.5 text-primary" />
            Direct Tribe Invitation
          </p>
          <p className="text-[10px] text-muted-foreground">
            They&apos;ll get a notification with a link to join {tribeName}.
          </p>
        </div>
      </ResponsiveDialogFooter>
    </ResponsiveDialog>
  );
}
