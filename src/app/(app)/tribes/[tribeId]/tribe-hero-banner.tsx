"use client";

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Users, Link2, UserPlus, Settings, MoreVertical, LogOut } from "lucide-react";
import { moodsData } from '@/lib/moods-data';
import { useTribeDetail } from './tribe-detail-context';

export function TribeHeroBanner() {
  const router = useRouter();
  const { state, tribeId, isTribeAdmin, handleJoinTribe, handleLeaveTribe } = useTribeDetail();
  const { tribe, isMember, isJoining } = state;

  if (!tribe) return null;

  const tribeMoodObjects = tribe.moods?.map((slug: string) => moodsData.find(m => m.slug === slug)).filter(Boolean) || [];

  return (
    <Card className="overflow-hidden shadow-xl relative">
      <div className="absolute top-4 left-4 z-10">
        <Button variant="outline" size="icon" onClick={() => router.back()} className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
          <ArrowLeft className="h-5 w-5" />
        </Button>
      </div>
      {isMember && (
        <div className="absolute top-4 right-4 z-10">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="bg-background/70 hover:bg-background/90 backdrop-blur-sm">
                <MoreVertical className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isTribeAdmin && (
                <>
                  <DropdownMenuItem onClick={() => router.push(`/tribes/${tribeId}/settings`)}>
                    <Settings className="mr-2 h-4 w-4" /> Tribe Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={handleLeaveTribe}
              >
                <LogOut className="mr-2 h-4 w-4" /> Leave Tribe
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <div className="relative h-48 md:h-64 w-full">
        <Image
          src={tribe.cover}
          alt={`${tribe.name} cover image`}
          fill
          style={{ objectFit: "cover" }}
          data-ai-hint={tribe.dataAiHint || "community group"}
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
      </div>
      <CardHeader className="relative -mt-16 z-10 p-4 md:p-6 bg-transparent">
        <CardTitle className="text-3xl md:text-4xl font-bold text-white font-mono tracking-tight drop-shadow-lg">{tribe.name}</CardTitle>
        <div className="flex items-center space-x-3 pt-1">
          <Badge variant={tribe.isPublic ? "secondary" : "destructive"} className="text-xs py-1 px-2 backdrop-blur-sm bg-black/30 text-white border-white/50">
            {tribe.isPublic ? "Public Tribe" : "Private Tribe"}
          </Badge>
          <div className="flex items-center text-sm text-white drop-shadow-md">
            <Users className="h-4 w-4 mr-1.5" /> {tribe.members} members
          </div>
          {tribe.homepageUrl && (
            <a href={tribe.homepageUrl} target="_blank" rel="noopener noreferrer" className="flex items-center text-sm text-white hover:text-primary-foreground hover:underline drop-shadow-md transition-colors">
              <Link2 className="h-4 w-4 mr-1.5" /> Website
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6 pt-2">
        <p className="text-sm text-muted-foreground mb-3 leading-relaxed">{tribe.description}</p>
        {tribeMoodObjects.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {tribeMoodObjects.map((mood: any) => mood && (
              <Badge key={mood.slug} variant="outline" className={`border-current ${mood.textClass} ${mood.bgClass}/30`}>
                {mood.emoji} {mood.name}
              </Badge>
            ))}
          </div>
        )}
        {!isMember && tribe.isPublic && (
          <div className="mt-4 pt-4 border-t">
            <Button onClick={handleJoinTribe} disabled={isJoining}>
              <UserPlus className="mr-2 h-4 w-4" />
              {isJoining ? 'Joining...' : 'Join Tribe'}
            </Button>
            <p className="text-xs text-muted-foreground mt-2">
              {tribe.joinMechanism === 'approval' ? 'Your request will be sent to the tribe admins for approval.' : 'You can join this tribe immediately.'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
