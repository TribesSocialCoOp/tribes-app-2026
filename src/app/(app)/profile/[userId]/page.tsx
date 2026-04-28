"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, LayoutGrid, Shield, MessageSquareText, User as UserIcon } from "lucide-react";
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { getPublicProfile, getPublicWallBlocks, getPublicWallStyle } from '@/lib/actions/profile-actions';
import HtmlBlock from '@/components/wall-blocks/html-block';
import MusicBlock from '@/components/wall-blocks/music-block';
import VideoBlock from '@/components/wall-blocks/video-block';
import MyPostsBlock from '@/components/wall-blocks/my-posts-block';

interface WallBlock {
  id: string;
  type: 'my-posts' | 'html' | 'music' | 'video';
  content: any;
}

interface WallStyles {
  backgroundColor: string;
  layout: 'single-column' | 'two-column';
}

interface PublicProfile {
  id: string;
  name: string;
  bio?: string;
  avatar?: string;
  reputationStatus?: string;
}

const STATUS_COLORS: Record<string, string> = {
  'Onboarding': 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  'Newcomer': 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  'Active': 'bg-green-500/10 text-green-400 border-green-500/20',
  'Trusted': 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  'Veteran': 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  'Elder': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

export default function PublicProfilePage() {
  const params = useParams();
  const userId = params.userId as string;
  const router = useRouter();
  const { user } = useUser();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [blocks, setBlocks] = useState<WallBlock[]>([]);
  const [styles, setStyles] = useState<WallStyles>({ backgroundColor: 'bg-background', layout: 'single-column' });
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bondId, setBondId] = useState<string | null>(null);

  // If viewing own profile, redirect to /my-wall
  useEffect(() => {
    if (user?.id && userId === user.id) {
      router.replace('/my-wall');
    }
  }, [user?.id, userId, router]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [prof, rawBlocks, wallStyle] = await Promise.all([
          getPublicProfile(userId),
          getPublicWallBlocks(userId),
          getPublicWallStyle(userId),
        ]);

        if (!prof) {
          setNotFound(true);
          return;
        }

        setProfile(prof);
        setStyles(wallStyle as WallStyles);

        if (rawBlocks.length > 0) {
          setBlocks(rawBlocks.map((b: any) => ({
            id: b.id,
            type: b.type as WallBlock['type'],
            content: JSON.parse(b.content),
          })));
        }
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    if (userId) load();
  }, [userId]);

  // Look up if we have a bond with this user
  useEffect(() => {
    async function checkBond() {
      if (!user?.id || userId === user.id) return;
      try {
        const { getBonds } = await import('@/lib/actions/bond-actions');
        const bonds = await getBonds();
        const match = bonds.find(b => b.targetId === userId && b.targetType === 'user' && b.passkeyStatus !== 'expired');
        if (match) setBondId(match.id);
      } catch {}
    }
    checkBond();
  }, [user?.id, userId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <UserIcon className="h-16 w-16 text-muted-foreground/30" />
        <h2 className="text-xl font-semibold text-foreground">User Not Found</h2>
        <p className="text-muted-foreground text-sm">This profile doesn't exist or has been removed.</p>
        <Button variant="outline" onClick={() => router.back()}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Go Back
        </Button>
      </div>
    );
  }

  const initials = profile.name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const renderBlock = (block: WallBlock) => {
    switch (block.type) {
      case 'my-posts':
        return <MyPostsBlock key={block.id} posts={block.content.posts} onShare={() => {}} onCreatePost={() => {}} readOnly />;
      case 'html':
        return <HtmlBlock key={block.id} content={block.content} />;
      case 'music':
        return <MusicBlock key={block.id} content={block.content} />;
      case 'video':
        return <VideoBlock key={block.id} content={block.content} />;
      default:
        return null;
    }
  };

  return (
    <div className={cn("p-4 md:p-6 rounded-lg transition-colors min-h-[60vh]", styles.backgroundColor)}>
      <div className="space-y-8 max-w-7xl mx-auto">
        {/* Profile Header */}
        <header className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => router.back()} className="shrink-0 -ml-2">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <Avatar className="h-16 w-16 sm:h-20 sm:w-20 border-2 border-primary/20">
            {profile.avatar && <AvatarImage src={profile.avatar} alt={profile.name} />}
            <AvatarFallback className="text-xl font-bold bg-primary/10 text-primary">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-normal text-foreground">
                {profile.name}
              </h1>
              {profile.reputationStatus && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-medium",
                    STATUS_COLORS[profile.reputationStatus] ?? STATUS_COLORS['Newcomer']
                  )}
                >
                  <Shield className="h-3 w-3 mr-1" />
                  {profile.reputationStatus}
                </Badge>
              )}
            </div>
            {profile.bio && (
              <p className="text-muted-foreground mt-1 text-sm sm:text-base line-clamp-3">
                {profile.bio}
              </p>
            )}
            {bondId && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2 border-primary/30 text-primary hover:bg-primary/10"
                onClick={() => router.push(`/bonds/${bondId}`)}
              >
                <MessageSquareText className="mr-2 h-4 w-4" /> Message
              </Button>
            )}
          </div>
        </header>

        {/* Wall Content */}
        {blocks.length > 0 ? (
          <div className={cn(
            "space-y-8",
            styles.layout === 'two-column' && "md:grid md:grid-cols-2 md:gap-8 md:space-y-0"
          )}>
            {blocks.map(block => renderBlock(block))}
          </div>
        ) : (
          <Card className="border-dashed shadow-none">
            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
              <LayoutGrid className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-semibold text-foreground mb-1">No wall content yet</h3>
              <p className="text-sm text-muted-foreground max-w-sm">
                {profile.name} hasn't customized their wall yet. Check back later!
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
