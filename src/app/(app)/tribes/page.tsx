
"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, PlusCircle, ArrowRight, Smile, MessageCircle, LayoutGrid, List, Eye, UserPlus, HeartHandshake, Loader2 } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';
import { tribesData, type Tribe } from '@/lib/data';
import { useUser } from '@/hooks/use-user';
import { useToast } from '@/hooks/use-toast';

const TribeListItem: React.FC<{ tribe: Tribe; isMyTribe: boolean; onJoin: (tribe: Tribe) => void; isJoining: boolean }> = ({ tribe, isMyTribe, onJoin, isJoining }) => (
  <div className="flex items-center justify-between p-3 hover:bg-muted/50 border-b last:border-b-0">
    <div className="flex items-center space-x-3">
      <Image src={tribe.cover} alt={tribe.name} width={40} height={40} className="rounded-md object-cover h-10 w-10" data-ai-hint={tribe.dataAiHint} />
      <div>
        <Link href={`/tribes/${tribe.id}`} passHref>
          <h3 className="font-semibold text-sm hover:underline">{tribe.name}</h3>
        </Link>
        <div className="flex items-center text-xs text-muted-foreground space-x-2">
          <span><Users className="h-3 w-3 inline mr-0.5" />{tribe.members}</span>
          <Badge variant={tribe.isPublic ? "secondary" : "outline"} className={cn("text-xs px-1.5 py-0.5", !tribe.isPublic && "border-pink-500 text-pink-500 bg-pink-500/10")}>{tribe.isPublic ? "Public" : "Private"}</Badge>
        </div>
      </div>
    </div>
    {isMyTribe ? (
      <Link href={`/tribes/${tribe.id}`} passHref>
        <Button variant="outline" size="sm">
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      </Link>
    ) : (
      <Button variant="outline" size="sm" onClick={() => onJoin(tribe)} disabled={isJoining}>
        {isJoining ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin"/> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
        {isJoining ? 'Joining...' : 'Join'}
      </Button>
    )}
  </div>
);

export default function TribesPage() {
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');
  const [allTribes, setAllTribes] = useState<Tribe[]>([]);
  const [myTribeIds, setMyTribeIds] = useState<string[]>([]);
  const [isClient, setIsClient] = useState(false);
  const [joiningStates, setJoiningStates] = useState<Record<string, boolean>>({});
  const { role } = useUser();
  const { toast } = useToast();
  const canCreate = role !== 'Human_Free';

  const baseTribeMemberships = ['1', '3', '6', '7'];

  const syncData = () => {
    // Combine base memberships with any created in this session from localStorage
    const createdTribeIds: string[] = JSON.parse(localStorage.getItem('myCreatedTribeIds') || '[]');
    setMyTribeIds([...new Set([...baseTribeMemberships, ...createdTribeIds])]);
    setAllTribes(tribesData);
  };
  
  useEffect(() => {
    setIsClient(true);
    syncData(); // Initial sync

    window.addEventListener('focus', syncData);
    return () => {
      window.removeEventListener('focus', syncData);
    };
  }, []);
  
  const handleJoinTribe = (tribeToJoin: Tribe) => {
    if (!tribeToJoin) return;
    setJoiningStates(prev => ({ ...prev, [tribeToJoin.id]: true }));

    // Simulate API call
    setTimeout(() => {
        if (tribeToJoin.joinMechanism === 'approval') {
            toast({ title: "Request Sent", description: `Your request to join ${tribeToJoin.name} is pending approval.` });
        } else {
            const currentMyTribeIds = JSON.parse(localStorage.getItem('myCreatedTribeIds') || '[]');
            currentMyTribeIds.push(tribeToJoin.id);
            localStorage.setItem('myCreatedTribeIds', JSON.stringify([...new Set(currentMyTribeIds)]));
            syncData(); // Re-sync data to update the lists
            toast({ title: "Welcome!", description: `You have successfully joined ${tribeToJoin.name}.` });
        }
        setJoiningStates(prev => ({ ...prev, [tribeToJoin.id]: false }));
    }, 1000);
  };

  const { myTribes, discoverTribes } = useMemo(() => {
    if (!isClient) {
      // Return server-side rendered state initially to avoid hydration mismatch
      const initialMyTribes = tribesData.filter(t => baseTribeMemberships.includes(t.id));
      const initialDiscoverTribes = tribesData.filter(t => !baseTribeMemberships.includes(t.id) && t.isPublic);
      return { myTribes: initialMyTribes, discoverTribes: initialDiscoverTribes };
    }

    const myTribes = allTribes.filter(t => myTribeIds.includes(t.id));
    const discoverTribes = allTribes.filter(t => !myTribeIds.includes(t.id) && t.isPublic);
    return { myTribes, discoverTribes };
  }, [allTribes, myTribeIds, isClient]);

  const renderTribeList = (tribes: Tribe[], isMyTribeList: boolean) => (
    <Card className="shadow-lg">
      <CardContent className="p-0">
        {tribes.length > 0 ? (
          tribes.map(tribe => <TribeListItem key={tribe.id} tribe={tribe} isMyTribe={isMyTribeList} onJoin={handleJoinTribe} isJoining={!!joiningStates[tribe.id]} />)
        ) : (
          <p className="p-4 text-center text-muted-foreground">No tribes in this category.</p>
        )}
      </CardContent>
    </Card>
  );

  const renderTribeCards = (tribes: Tribe[], isMyTribeList: boolean) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {tribes.map((tribe) => (
        <Card key={tribe.id} className="shadow-lg hover:shadow-xl transition-shadow flex flex-col overflow-hidden">
          <Link href={`/tribes/${tribe.id}`} passHref className="contents"> {/* Make whole card clickable */}
            <div className="relative h-40 w-full">
              <Image src={tribe.cover} alt={tribe.name} layout="fill" objectFit="cover" data-ai-hint={tribe.dataAiHint} />
              <Badge variant={tribe.isPublic ? "secondary" : "outline"} className={cn("absolute top-2 right-2", !tribe.isPublic && "border-pink-500 text-pink-500 bg-pink-500/10")}>
                {tribe.isPublic ? "Public" : "Private"}
              </Badge>
            </div>
            <CardHeader className="pb-2">
              <CardTitle className="text-xl font-semibold truncate tracking-normal">{tribe.name}</CardTitle>
            </CardHeader>
            <CardContent className="flex-grow pb-2">
              <CardDescription className="text-sm h-16 overflow-hidden text-ellipsis leading-relaxed">{tribe.description}</CardDescription>
              <div className="flex items-center text-xs text-muted-foreground mt-2 space-x-3">
                <div className="flex items-center"><Users className="h-3.5 w-3.5 mr-1"/> {tribe.members} members</div>
                <div className="flex items-center"><Smile className="h-3.5 w-3.5 mr-1"/> {Math.floor(Math.random()*500 + 50)} Vibes</div>
                <div className="flex items-center"><MessageCircle className="h-3.5 w-3.5 mr-1"/> {Math.floor(Math.random()*100 + 20)} Posts</div>
              </div>
            </CardContent>
          </Link>
          <CardFooter>
            {isMyTribeList ? (
              <Link href={`/tribes/${tribe.id}`} passHref className="w-full">
                <Button variant="default" className="w-full bg-primary hover:bg-primary/90">
                  View Tribe <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" className="w-full" onClick={() => handleJoinTribe(tribe)} disabled={joiningStates[tribe.id]}>
                {joiningStates[tribe.id] ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <UserPlus className="mr-2 h-4 w-4" />}
                {joiningStates[tribe.id] ? 'Joining...' : 'Join Tribe'}
              </Button>
            )}
          </CardFooter>
        </Card>
      ))}
    </div>
  );


  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-4xl font-bold tracking-normal text-foreground font-mono">Your Tribes</h1>
          <p className="text-lg text-muted-foreground mt-1">
            Manage your existing tribes or discover new ones to join.
          </p>
        </div>
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
      </header>

      <div className="mb-8 flex flex-col sm:flex-row justify-between items-center gap-4">
        <div className="relative flex-grow w-full sm:w-auto">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input placeholder="Search for tribes..." className="pl-10 py-3 text-base rounded-full shadow-sm w-full" />
        </div>
        <div className="flex items-center gap-2">
          <Button variant={viewMode === 'card' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('card')} aria-label="Card view">
            <LayoutGrid className="h-5 w-5" />
          </Button>
          <Button variant={viewMode === 'list' ? 'default' : 'outline'} size="icon" onClick={() => setViewMode('list')} aria-label="List view">
            <List className="h-5 w-5" />
          </Button>
        </div>
      </div>

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

      <section className="mt-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4">Discover Tribes</h2>
         {discoverTribes.length > 0 ? (
           viewMode === 'card' ? renderTribeCards(discoverTribes, false) : renderTribeList(discoverTribes, false)
         ) : (
            <p className="p-4 text-center text-muted-foreground">No new tribes to discover currently.</p>
         )}
          <div className="text-center mt-8">
            <Button variant="link" className="text-primary text-lg">Load More Tribes <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
      </section>
    </div>
  );
}
