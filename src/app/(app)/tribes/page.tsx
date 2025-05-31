
"use client";

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Users, Search, PlusCircle, ArrowRight, Smile, MessageCircle, LayoutGrid, List, Eye, UserPlus } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { cn } from '@/lib/utils';

interface Tribe {
  id: string;
  name: string;
  description: string;
  members: number;
  isPublic: boolean;
  cover: string;
  dataAiHint: string;
}

const tribesData: Tribe[] = [
  { id: "1", name: "AI Innovators", description: "Exploring the future of artificial intelligence and machine learning.", members: 128, isPublic: true, cover: "https://placehold.co/400x200.png?text=AI" , dataAiHint: "technology innovation" },
  { id: "2", name: "Weekend Hikers Club", description: "Sharing trails, tips, and breathtaking views from our adventures.", members: 76, isPublic: true, cover: "https://placehold.co/400x200.png?text=Hiking" , dataAiHint: "nature mountain" },
  { id: "3", name: "Indie Game Devs", description: "A community for indie game developers to collaborate and showcase.", members: 245, isPublic: false, cover: "https://placehold.co/400x200.png?text=Games" , dataAiHint: "gaming development" },
  { id: "4", name: "Local Bookworms", description: "Discussing our favorite reads and discovering new authors together.", members: 55, isPublic: true, cover: "https://placehold.co/400x200.png?text=Books" , dataAiHint: "reading library" },
  { id: "5", name: "Sustainable Living Hub", description: "Tips and discussions on eco-friendly practices and sustainability.", members: 92, isPublic: true, cover: "https://placehold.co/400x200.png?text=Eco" , dataAiHint: "nature environment" },
];

const TribeListItem: React.FC<{ tribe: Tribe; isMyTribe: boolean }> = ({ tribe, isMyTribe }) => (
  <div className="flex items-center justify-between p-3 hover:bg-muted/50 border-b last:border-b-0">
    <div className="flex items-center space-x-3">
      <Image src={tribe.cover} alt={tribe.name} width={40} height={40} className="rounded-md object-cover h-10 w-10" data-ai-hint={tribe.dataAiHint} />
      <div>
        <Link href={`/tribes/${tribe.id}`} passHref>
          <h3 className="font-semibold text-sm hover:underline">{tribe.name}</h3>
        </Link>
        <div className="flex items-center text-xs text-muted-foreground space-x-2">
          <span><Users className="h-3 w-3 inline mr-0.5" />{tribe.members}</span>
          <Badge variant={tribe.isPublic ? "secondary" : "outline"} className="text-xs px-1.5 py-0.5">{tribe.isPublic ? "Public" : "Private"}</Badge>
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
      <Button variant="outline" size="sm">
        <UserPlus className="mr-1.5 h-3.5 w-3.5" /> Join
      </Button>
    )}
  </div>
);

export default function TribesPage() {
  const [viewMode, setViewMode] = useState<'card' | 'list'>('card');

  // Example filters for "My Tribes" and "Discover Tribes"
  const myTribes = tribesData.filter(t => t.members > 100).slice(0, 3);
  const discoverTribes = tribesData.filter(t => t.members <= 100).slice(0, 3);

  const renderTribeList = (tribes: Tribe[], isMyTribeList: boolean) => (
    <Card className="shadow-lg">
      <CardContent className="p-0">
        {tribes.length > 0 ? (
          tribes.map(tribe => <TribeListItem key={tribe.id} tribe={tribe} isMyTribe={isMyTribeList} />)
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
          <div className="relative h-40 w-full">
            <Image src={tribe.cover} alt={tribe.name} layout="fill" objectFit="cover" data-ai-hint={tribe.dataAiHint} />
            <Badge variant={tribe.isPublic ? "secondary" : "destructive"} className="absolute top-2 right-2">
              {tribe.isPublic ? "Public" : "Private"}
            </Badge>
          </div>
          <CardHeader className="pb-2">
            <CardTitle className="text-xl font-semibold truncate">{tribe.name}</CardTitle>
          </CardHeader>
          <CardContent className="flex-grow pb-2">
            <CardDescription className="text-sm h-16 overflow-hidden text-ellipsis leading-relaxed">{tribe.description}</CardDescription>
            <div className="flex items-center text-xs text-muted-foreground mt-2 space-x-3">
              <div className="flex items-center"><Users className="h-3.5 w-3.5 mr-1"/> {tribe.members} members</div>
              <div className="flex items-center"><Smile className="h-3.5 w-3.5 mr-1"/> 1.2k Good Vibes</div>
              <div className="flex items-center"><MessageCircle className="h-3.5 w-3.5 mr-1"/> 300 Posts</div>
            </div>
          </CardContent>
          <CardFooter>
            {isMyTribeList ? (
              <Link href={`/tribes/${tribe.id}`} passHref className="w-full">
                <Button variant="default" className="w-full bg-primary hover:bg-primary/90">
                  View Tribe <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </Link>
            ) : (
              <Button variant="outline" className="w-full">
                Join Tribe
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
          <h1 className="text-4xl font-bold tracking-tight text-foreground font-mono">Your Tribes</h1>
          <p className="text-lg text-muted-foreground mt-1">
            Manage your existing tribes or discover new ones to join.
          </p>
        </div>
        <Link href="/tribes/create" passHref>
          <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <PlusCircle className="mr-2 h-5 w-5" /> Create New Tribe
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
            <CardTitle>No Tribes Yet</CardTitle>
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
    
