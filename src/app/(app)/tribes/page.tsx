
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, PlusCircle, ArrowRight, Smile, MessageCircle, LayoutGrid, List, Eye, UserPlus, HeartHandshake, Loader2, ShieldCheck, History, X, Globe, Lock, Clock } from "lucide-react";
import Link from "next/link";
import { useRouter } from 'next/navigation';
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import type { Tribe, UserProfile } from '@/lib/types';
import { getTribes, getMyTribeIds, requestToJoinTribe, checkPendingMembership } from '@/lib/actions/tribe-actions';
import { useUser } from '@/hooks/use-user';
import { useAgeGate } from '@/components/providers/age-gate-provider';
import { useToast } from '@/hooks/use-toast';
import { JoinTribeDialog } from '@/components/dialogs/join-tribe-dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

import { REPUTATION_HIERARCHY, TRIBE_0_ID, meetsReputationGate } from '@/lib/constants';


const checkJoinRequirements = (tribe: Tribe, user: UserProfile | null): { canJoin: boolean; requirement?: string; reason?: 'reputation' | 'onboarding' | 'age' } => {
    if (!user) return { canJoin: false, requirement: 'Unknown', reason: 'reputation' };

    // Onboarding users can only join tribes with NO requirements.
    if (user.reputationStatus === 'Onboarding') {
        if (tribe.id === TRIBE_0_ID) return { canJoin: false, requirement: undefined, reason: 'onboarding' };
        if (tribe.minimumReputation && (tribe.minimumReputation as string) !== 'None') {
            return { canJoin: false, requirement: tribe.minimumReputation, reason: 'onboarding' };
        }
        if (tribe.minimumAccountAgeDays && tribe.minimumAccountAgeDays > 0) {
            return { canJoin: false, requirement: `${tribe.minimumAccountAgeDays} days`, reason: 'onboarding' };
        }
        return { canJoin: true, requirement: undefined, reason: 'onboarding' };
    }
    
    // Check reputation requirement
    if (tribe.minimumReputation && (tribe.minimumReputation as string) !== 'None') {
        if (!meetsReputationGate(user.reputationStatus, tribe.minimumReputation)) {
            return { canJoin: false, requirement: tribe.minimumReputation, reason: 'reputation' };
        }
    }

    // Check account age requirement
    if (tribe.minimumAccountAgeDays && user.accountCreatedAt) {
        const accountAgeInDays = (new Date().getTime() - new Date(user.accountCreatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (accountAgeInDays < tribe.minimumAccountAgeDays) {
            return { canJoin: false, requirement: `${tribe.minimumAccountAgeDays} days`, reason: 'age' };
        }
    }

    return { canJoin: true };
};


const TribeListItem: React.FC<{ tribe: Tribe; isMyTribe: boolean; onJoin: (tribe: Tribe) => void; isJoining: boolean; user: UserProfile | null; isPending: boolean; isLoggedIn: boolean }> = ({ tribe, isMyTribe, onJoin, isJoining, user, isPending, isLoggedIn }) => {

  const { canJoin, requirement, reason } = checkJoinRequirements(tribe, user);
  const joinButtonIsDisabled = isJoining || (!isLoggedIn ? false : !canJoin);

  const joinButton = (
    <Button variant="outline" size="sm" onClick={() => onJoin(tribe)} disabled={isJoining}>
        {isJoining ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
        {isJoining ? 'Joining...' : 'Join'}
    </Button>
  );

  const getTooltipContent = () => {
    switch (reason) {
      case 'onboarding':
        return `You must complete onboarding to join tribes with requirements.`;
      case 'reputation':
        return `A '${requirement}' reputation is required to join.`;
      case 'age':
        return `Your account must be at least ${requirement} old to join.`;
      default:
        return 'You do not meet the requirements to join this tribe.';
    }
  };

  return (
    <div className="flex items-center justify-between p-3 hover:bg-muted/50 border-b last:border-b-0">
      <div className="flex items-center space-x-3">
        <Image src={tribe.cover} alt={tribe.name} width={96} height={96} className="rounded-md object-cover h-10 w-10" data-ai-hint={tribe.dataAiHint} />
        <div>
          <Link href={`/t/${tribe.slug}`} passHref>
            <h3 className="font-semibold text-sm hover:underline">{tribe.name}</h3>
          </Link>
          <div className="flex items-center text-xs text-muted-foreground space-x-2">
            <span><Users className="h-3 w-3 inline mr-0.5" />{tribe.members}</span>
            <Badge variant={tribe.isPublic ? "secondary" : "outline"} className={cn("text-xs px-1.5 py-0.5", !tribe.isPublic && "border-pink-500 text-pink-500 bg-pink-500/10")}>{tribe.isPublic ? "Public" : "Private"}</Badge>
            {tribe.minimumReputation && (
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <span className="flex items-center"><ShieldCheck className="h-3 w-3 inline mr-0.5 text-blue-500" />{tribe.minimumReputation}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Minimum reputation to join: {tribe.minimumReputation}</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
            {tribe.minimumAccountAgeDays && (
                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger>
                            <span className="flex items-center"><History className="h-3 w-3 inline mr-0.5 text-blue-500" />{tribe.minimumAccountAgeDays}d</span>
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>Minimum account age to join: {tribe.minimumAccountAgeDays} days</p>
                        </TooltipContent>
                    </Tooltip>
                </TooltipProvider>
            )}
          </div>
        </div>
      </div>
      {isMyTribe ? (
        <Link href={`/t/${tribe.slug}`} passHref>
          <Button variant="outline" size="sm">
            <Eye className="mr-1.5 h-3.5 w-3.5" /> View
          </Button>
        </Link>
      ) : !isLoggedIn ? (
        <Link href={`/t/${tribe.slug}`} passHref>
          <Button variant="outline" size="sm">
            <Eye className="mr-1.5 h-3.5 w-3.5" /> View
          </Button>
        </Link>
      ) : isPending ? (
        <div className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 font-medium">
          <Clock className="h-3.5 w-3.5" /> Pending
        </div>
      ) : !canJoin ? (
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <div className="inline-block">{joinButton}</div>
                    </TooltipTrigger>
                    <TooltipContent>
                        <p>{getTooltipContent()}</p>
                    </TooltipContent>
                </Tooltip>
            </TooltipProvider>
        ) : (
            joinButton
        )
      }
    </div>
  );
};

export default function TribesPage() {
  const [viewMode, setViewMode] = useState<'card' | 'list'>(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('tribes_view_mode');
      if (stored === 'card' || stored === 'list') return stored;
    }
    return 'card';
  });
  const [allTribes, setAllTribes] = useState<Tribe[]>([]);
  const [myTribeIds, setMyTribeIds] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [joiningStates, setJoiningStates] = useState<Record<string, boolean>>({});
  const [pendingTribeIds, setPendingTribeIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const { user, role } = useUser();
  const router = useRouter();
  const { toast } = useToast();
  const { openAgeGate } = useAgeGate();
  const isLoggedIn = !!role;
  const canCreate = isLoggedIn && user?.role !== 'Human_Free';

  // New state for the join dialog
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const [tribeToJoin, setTribeToJoin] = useState<Tribe | null>(null);

  const handleSetViewMode = (mode: 'card' | 'list') => {
    setViewMode(mode);
    localStorage.setItem('tribes_view_mode', mode);
  };

  const syncData = async () => {
    // Fetch tribes (public ones for guests, all visible for logged-in users)
    const [fetchedTribes, memberTribeIds] = await Promise.all([
      getTribes(),
      getMyTribeIds(),
    ]);
    setAllTribes(fetchedTribes);
    setMyTribeIds(memberTribeIds);

    // Check pending status only for logged-in users on approval tribes
    if (memberTribeIds.length > 0 || isLoggedIn) {
      const approvalTribes = fetchedTribes.filter(
        t => t.isPublic && t.joinMechanism === 'approval' && !memberTribeIds.includes(t.id)
      );
      if (approvalTribes.length > 0) {
        const pendingChecks = await Promise.all(
          approvalTribes.map(t => checkPendingMembership(t.id).then(isPending => ({ id: t.id, isPending })))
        );
        setPendingTribeIds(new Set(pendingChecks.filter(c => c.isPending).map(c => c.id)));
      }
    }
  };
  
  useEffect(() => {
    setIsClient(true);
    syncData(); // Initial sync

    window.addEventListener('focus', syncData);
    return () => {
      window.removeEventListener('focus', syncData);
    };
  }, []);
  
  const handleOpenJoinDialog = (tribeToJoin: Tribe) => {
    if (!tribeToJoin) return;
    if (!isLoggedIn) {
      // Redirect unauthenticated users to signup
      router.push('/signup');
      return;
    }
    setTribeToJoin(tribeToJoin);
    setIsJoinDialogOpen(true);
  };

  const handleConfirmJoin = async (tribeToJoin: Tribe, selectedAlias?: string, aliasAvatar?: string) => {
    setJoiningStates(prev => ({ ...prev, [tribeToJoin.id]: true }));
    setIsJoinDialogOpen(false); // Close the dialog immediately for better UX

    try {
      const result = await requestToJoinTribe(tribeToJoin.id, selectedAlias, aliasAvatar);
      if (result === 'pending') {
        setPendingTribeIds(prev => new Set(prev).add(tribeToJoin.id));
        toast({ title: "Request Sent!", description: `Your request to join ${tribeToJoin.name} is pending approval. The tribe admins will review it shortly.` });
      } else if (result === 'joined') {
        await syncData(); // Re-sync data from DB to update the lists
        toast({ title: "Welcome!", description: `You have successfully joined ${tribeToJoin.name}.` });
      } else if (result === 'already_member') {
        toast({ title: "Already a Member", description: `You're already a member of ${tribeToJoin.name}.` });
        await syncData();
      } else if (result === 'already_pending') {
        setPendingTribeIds(prev => new Set(prev).add(tribeToJoin.id));
        toast({ title: "Request Already Sent", description: `Your request to join ${tribeToJoin.name} is still pending approval.` });
      } else if (result === 'age_required') {
        openAgeGate({ onVerified: () => handleConfirmJoin(tribeToJoin, selectedAlias, aliasAvatar) });
      } else if (result === 'opt_in_required') {
        toast({ title: "Enable adult content", description: `Turn on "Show adult content" in Settings on the web (tribes.app) to join ${tribeToJoin.name}.` });
      } else if (result === 'region_blocked') {
        toast({ title: "Not available in your region", description: "Adult content can't be shown where you are due to local law.", variant: "destructive" });
      } else {
        toast({ title: "Cannot Join", description: `Your request to join ${tribeToJoin.name} was rejected.`, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Error", description: "Failed to join tribe. Please try again.", variant: "destructive" });
    } finally {
      setJoiningStates(prev => ({ ...prev, [tribeToJoin.id]: false }));
      setTribeToJoin(null);
    }
  };

  const { myTribes, discoverTribes } = useMemo(() => {
    if (!isClient) {
      // Return server-side rendered state initially to avoid hydration mismatch
      return { myTribes: [], discoverTribes: [] };
    }

    const lowerSearch = searchTerm.toLowerCase().trim();
    const matchesSearch = (tribe: Tribe) => {
      if (!lowerSearch) return true;
      return (
        tribe.name.toLowerCase().includes(lowerSearch) ||
        tribe.description.toLowerCase().includes(lowerSearch)
      );
    };

    const myTribesList = isLoggedIn
      ? allTribes.filter(t => myTribeIds.includes(t.id) && matchesSearch(t))
      : [];
    const discoverTribesList = allTribes.filter(t => !myTribeIds.includes(t.id) && (t.isPublic || t.isListed) && t.id !== '0' && matchesSearch(t));
    return { myTribes: myTribesList, discoverTribes: discoverTribesList };
  }, [allTribes, myTribeIds, isClient, searchTerm, isLoggedIn]);

  const renderTribeList = (tribes: Tribe[], isMyTribeList: boolean) => (
    <Card className="shadow-lg">
      <CardContent className="p-0">
        {tribes.length > 0 ? (
          tribes.map(tribe => <TribeListItem key={tribe.id} tribe={tribe} isMyTribe={isMyTribeList} onJoin={handleOpenJoinDialog} isJoining={!!joiningStates[tribe.id]} user={user} isPending={pendingTribeIds.has(tribe.id)} isLoggedIn={isLoggedIn} />)
        ) : (
          <p className="p-4 text-center text-muted-foreground">No tribes in this category.</p>
        )}
      </CardContent>
    </Card>
  );

  const renderTribeCards = (tribes: Tribe[], isMyTribeList: boolean) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {tribes.map((tribe) => {
        const { canJoin, requirement, reason } = checkJoinRequirements(tribe, user);
        const joinButtonIsDisabled = !!joiningStates[tribe.id] || !canJoin;

        const getTooltipContent = () => {
            switch (reason) {
            case 'onboarding':
                return `You must complete onboarding to join tribes with requirements.`;
            case 'reputation':
                return `A '${requirement}' reputation is required to join.`;
            case 'age':
                return `Your account must be at least ${requirement} old to join.`;
            default:
                return 'You do not meet the requirements to join this tribe.';
            }
        };

        const joinButton = (
             <Button variant="outline" className="w-full" onClick={() => handleOpenJoinDialog(tribe)} disabled={joinButtonIsDisabled}>
                {joiningStates[tribe.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4" />}
                {joiningStates[tribe.id] ? 'Joining...' : 'Join Tribe'}
              </Button>
        );
        
        return (
            <Card key={tribe.id} className="shadow-lg hover:shadow-xl transition-shadow flex flex-col overflow-hidden">
                <Link href={`/t/${tribe.slug}`} passHref className="contents">
                    <div className="relative h-40 w-full">
                    <Image src={tribe.cover} alt={tribe.name} fill style={{ objectFit: 'cover', objectPosition: tribe.coverPosition || 'center' }} data-ai-hint={tribe.dataAiHint} />
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            "absolute top-2 right-2 p-1.5 rounded-full backdrop-blur-sm shadow-md",
                            tribe.isPublic
                              ? "bg-emerald-500/80 text-white"
                              : "bg-black/60 text-white"
                          )}>
                            {tribe.isPublic
                              ? <Globe className="h-3.5 w-3.5" />
                              : <Lock className="h-3.5 w-3.5" />
                            }
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>{tribe.isPublic ? "Public — anyone can discover" : "Private — invite only"}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    </div>
                    <CardHeader className="pb-2">
                    <CardTitle className="text-xl font-semibold truncate tracking-normal">{tribe.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex-grow pb-2">
                    <CardDescription className="text-sm h-16 overflow-hidden text-ellipsis leading-relaxed">{tribe.description}</CardDescription>
                    <div className="flex items-center text-xs text-muted-foreground mt-2 space-x-3">
                        <div className="flex items-center"><Users className="h-3.5 w-3.5 mr-1"/> {tribe.members} members</div>
                        {tribe.minimumReputation && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="flex items-center"><ShieldCheck className="h-3.5 w-3.5 mr-1 text-blue-500"/>{tribe.minimumReputation}</div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Minimum reputation to join: {tribe.minimumReputation}</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        {tribe.minimumAccountAgeDays && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger>
                                        <div className="flex items-center"><History className="h-3.5 w-3.5 mr-1 text-blue-500"/>{tribe.minimumAccountAgeDays}d</div>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <p>Minimum account age to join: {tribe.minimumAccountAgeDays} days</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                    </div>
                    </CardContent>
                </Link>
                <CardFooter>
                    {isMyTribeList ? (
                    <Link href={`/t/${tribe.slug}`} passHref className="w-full">
                        <Button variant="default" className="w-full bg-primary hover:bg-primary/90">
                        View Tribe <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                    ) : !isLoggedIn ? (
                    <Link href={`/t/${tribe.slug}`} passHref className="w-full">
                        <Button variant="outline" className="w-full">
                        <Eye className="mr-2 h-4 w-4" /> View Tribe
                        </Button>
                    </Link>
                    ) : pendingTribeIds.has(tribe.id) ? (
                        <div className="w-full flex items-center justify-center gap-2 py-2 text-sm text-amber-600 dark:text-amber-400 font-medium">
                          <Clock className="h-4 w-4" />
                          <span>Join Request Pending</span>
                        </div>
                    ) : !canJoin ? (
                        <TooltipProvider>
                            <Tooltip>
                                <TooltipTrigger asChild>
                                    <div className="w-full">{joinButton}</div>
                                </TooltipTrigger>
                                <TooltipContent>
                                    <p>{getTooltipContent()}</p>
                                </TooltipContent>
                            </Tooltip>
                        </TooltipProvider>
                    ) : (
                        joinButton
                    )}
                </CardFooter>
            </Card>
        );
      })}
    </div>
  );


  return (
    <>
      <div className="space-y-8">
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div className="flex flex-col md:flex-row md:items-baseline md:gap-3">
            <h1 className="text-2xl sm:text-4xl font-bold tracking-normal text-foreground font-mono">Explore Tribes</h1>
            <p className="text-lg text-muted-foreground mt-1 md:mt-0">
              {isLoggedIn ? 'Manage your existing tribes or discover new ones to join.' : 'Discover public communities and find your people.'}
            </p>
          </div>
          {isLoggedIn ? (
            <Link href={canCreate ? "/tribes/create" : "/billing"} passHref>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                {canCreate ? (
                  <PlusCircle className="mr-2 h-5 w-5" />
                ) : (
                  <HeartHandshake className="mr-2 h-5 w-5" />
                )}
                {canCreate ? "Create New Tribe" : "Upgrade to Create"}
              </Button>
            </Link>
          ) : (
            <Link href="/signup" passHref>
              <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
                <UserPlus className="mr-2 h-5 w-5" />
                Sign Up to Join
              </Button>
            </Link>
          )}
        </header>

        <div className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="relative flex-grow w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search for tribes..."
              className="pl-10 py-3 text-base rounded-full shadow-sm w-full"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              id="tribes-search-input"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Clear search"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant={viewMode === 'card' ? 'default' : 'outline'} size="icon" onClick={() => handleSetViewMode('card')} aria-label="Card view">
              <LayoutGrid className="h-5 w-5" />
            </Button>
            <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => handleSetViewMode('list')} aria-label="List view">
              <List className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {isLoggedIn && (
          <section>
            <h2 className="text-2xl font-semibold text-foreground mb-4">My Tribes</h2>
            {myTribes.length > 0 ? (
              viewMode === 'card' ? renderTribeCards(myTribes, true) : renderTribeList(myTribes, true)
            ) : (
              <Card className="text-center p-8">
                <Users className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
                <CardTitle className="tracking-normal">No Tribes Yet</CardTitle>
                <CardDescription className="mt-2 mb-4">You haven't joined or created any tribes. Start by creating one or exploring existing communities.</CardDescription>
                <Link href="/tribes/create" passHref>
                  <Button variant="default">Create Your First Tribe</Button>
                </Link>
              </Card>
            )}
          </section>
        )}

        <section className={isLoggedIn ? "mt-12" : ""}>
          <h2 className="text-2xl font-semibold text-foreground mb-4">{isLoggedIn ? 'Discover Tribes' : 'Public Tribes'}</h2>
         {discoverTribes.length > 0 ? (
           viewMode === 'card' ? renderTribeCards(discoverTribes, false) : renderTribeList(discoverTribes, false)
         ) : (
            <p className="p-4 text-center text-muted-foreground">No new tribes to discover currently.</p>
         )}
      </section>
      </div>
      <JoinTribeDialog
        isOpen={isJoinDialogOpen}
        onOpenChange={setIsJoinDialogOpen}
        tribe={tribeToJoin}
        onConfirmJoin={handleConfirmJoin}
        isJoining={tribeToJoin ? !!joiningStates[tribeToJoin.id] : false}
      />
    </>
  );
}
