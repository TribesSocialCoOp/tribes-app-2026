"use client";

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { ArrowLeft, Loader2, LayoutGrid, Shield, MessageSquareText, User as UserIcon, Handshake, Clock, MoreVertical, Ban, Flag } from "lucide-react";
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { getPublicProfile, getPublicWallBlocks, getPublicWallStyle } from '@/lib/actions/profile-actions';
import HtmlBlock from '@/components/wall-blocks/html-block';
import MusicBlock from '@/components/wall-blocks/music-block';
import VideoBlock from '@/components/wall-blocks/video-block';
import MyPostsBlock from '@/components/wall-blocks/my-posts-block';
import { BondRequestDialog } from '@/components/dialogs/bond-request-dialog';
import { hasOutgoingBondRequest } from '@/lib/actions/bond-actions';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { useToast } from '@/hooks/use-toast';
import { getPinnedWallPosts, getCurrentMood } from '@/lib/actions/content-actions';
import { moodsData } from '@/lib/moods-data';
import { getEmbedUrl } from '@/lib/media-embeds';
import { Music, Pin, BookLock } from "lucide-react";
import type { TribePost } from '@/lib/types';


interface WallBlock {
  id: string;
  type: 'my-posts' | 'html' | 'music' | 'video';
  content: any;
}

interface WallStyles {
  backgroundColor: string;
  layout: 'single-column' | 'two-column';
  nowPlayingUrl?: string;
}


/** Normalize legacy light-only bg values to theme-aware equivalents. */
const LEGACY_BG_MAP: Record<string, string> = {
  'bg-slate-200': 'bg-slate-200 dark:bg-slate-800',
  'bg-blue-100':  'bg-blue-100 dark:bg-blue-950',
  'bg-green-100': 'bg-green-100 dark:bg-green-950',
  'bg-pink-100':  'bg-pink-100 dark:bg-pink-950',
};
function normalizeWallBg(bg: string): string {
  return LEGACY_BG_MAP[bg] ?? bg;
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

export default function PublicProfilePage({ userId: propUserId }: { userId?: string }) {
  const params = useParams();
  const userId = propUserId || (params.userId as string);
  const router = useRouter();
  const { user } = useUser();

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [blocks, setBlocks] = useState<WallBlock[]>([]);
  const [styles, setStyles] = useState<WallStyles>({ backgroundColor: 'bg-background', layout: 'single-column' });
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [bondId, setBondId] = useState<string | null>(null);
  const [hasPending, setHasPending] = useState(false);
  const [showBondDialog, setShowBondDialog] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [pinnedPosts, setPinnedPosts] = useState<TribePost[]>([]);
  const [currentMood, setCurrentMood] = useState<{ slug: string; emoji: string; name: string } | null>(null);
  const { toast } = useToast();


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
        const [prof, rawBlocks, wallStyle, pinned, mood] = await Promise.all([
          getPublicProfile(userId),
          getPublicWallBlocks(userId),
          getPublicWallStyle(userId),
          getPinnedWallPosts(userId),
          getCurrentMood(userId),
        ]);


        if (!prof) {
          setNotFound(true);
          return;
        }

        setProfile(prof);
        const ws = wallStyle as WallStyles;
        ws.backgroundColor = normalizeWallBg(ws.backgroundColor);
        setStyles(ws);

        if (rawBlocks.length > 0) {
          setBlocks(rawBlocks.map((b: any) => ({
            id: b.id,
            type: b.type as WallBlock['type'],
            content: JSON.parse(b.content),
          })));
        }

        setPinnedPosts(pinned);
        if (mood) {
          const m = moodsData.find(item => item.slug === mood.moodTag);
          if (m) setCurrentMood(m);
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
        if (match) {
          setBondId(match.id);
        } else {
          // If no active bond, check for pending request
          const pending = await hasOutgoingBondRequest(userId);
          setHasPending(pending);
        }
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
              {currentMood && (
                <Badge variant="secondary" className="bg-primary/5 text-primary border-primary/10">
                  <span className="mr-1.5">{currentMood.emoji}</span>
                  Feeling {currentMood.name}
                </Badge>
              )}
            </div>
            {profile.bio && (
              <p className="text-muted-foreground mt-1 text-sm sm:text-base line-clamp-3">
                {profile.bio}
              </p>
            )}

            {userId !== user?.id && (
              user?.id && bondId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-primary/30 text-primary hover:bg-primary/10"
                  onClick={() => router.push(`/bonds/${bondId}`)}
                >
                  <MessageSquareText className="mr-2 h-4 w-4" /> Message
                </Button>
              ) : user?.id && hasPending ? (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-2"
                  disabled
                >
                  <Clock className="mr-2 h-4 w-4 animate-pulse" /> Bond Request Pending
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 border-primary/50 text-primary hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                  onClick={() => {
                    if (!user?.id) router.push('/login');
                    else setShowBondDialog(true);
                  }}
                >
                  <Handshake className="mr-2 h-4 w-4" /> Request Bond
                </Button>
              )
            )}
          </div>
          {/* Block / Report menu — only for other users */}
          {user?.id && userId !== user.id && (
            <ResponsiveMenu>
              <ResponsiveMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 self-start">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </ResponsiveMenuTrigger>
              <ResponsiveMenuContent align="end">
                <ResponsiveMenuItem
                  onClick={async () => {
                    try {
                      const { reportUser } = await import('@/lib/actions/bond-actions');
                      await reportUser(userId, 'Reported from profile page');
                      toast({ title: 'User Reported', description: 'Thank you for helping keep the community safe.' });
                    } catch {
                      toast({ variant: 'destructive', title: 'Error', description: 'Could not submit report.' });
                    }
                  }}
                >
                  <Flag className="mr-2 h-4 w-4" /> Report User
                </ResponsiveMenuItem>
                <ResponsiveMenuSeparator />
                <ResponsiveMenuItem
                  className="text-destructive hover:!bg-destructive/10 hover:!text-destructive"
                  onClick={() => setShowBlockConfirm(true)}
                >
                  <Ban className="mr-2 h-4 w-4" /> Block User
                </ResponsiveMenuItem>
              </ResponsiveMenuContent>
            </ResponsiveMenu>
          )}
        </header>

        {/* Block Confirmation Dialog */}
        <ConfirmActionDialog
          open={showBlockConfirm}
          onOpenChange={setShowBlockConfirm}
          title={`Block ${profile.name}?`}
          description={`${profile.name} will no longer be able to see your posts, find you in search, or message you. You won't see their content either. This can be undone from your bond settings.`}
          confirmText="Block User"
          destructive
          onConfirm={async () => {
            try {
              const { blockUser } = await import('@/lib/actions/bond-actions');
              await blockUser(userId, 'Blocked from profile page');
              toast({ title: 'User Blocked', description: `${profile.name} has been blocked.` });
              router.back();
            } catch {
              toast({ variant: 'destructive', title: 'Error', description: 'Could not block user.' });
            }
          }}
        />

        
        {/* Wall Content */}
        <div className="space-y-8">
          {/* Now Playing (Parity with Wall) */}
          {styles.nowPlayingUrl && (
            <div className="max-w-md mx-auto sm:mx-0">
              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground">
                <Music className="h-3.5 w-3.5 animate-pulse text-primary" />
                <span className="font-medium">Now Playing</span>
              </div>
              <div className="rounded-lg overflow-hidden shadow-sm border bg-background/50 backdrop-blur-sm">
                <iframe
                  src={getEmbedUrl(styles.nowPlayingUrl) ?? undefined}
                  width="100%"
                  height={styles.nowPlayingUrl.includes('youtube') || styles.nowPlayingUrl.includes('vimeo') ? '200' : '152'}
                  allow="autoplay; encrypted-media; fullscreen"
                  className="border-0 block"
                  loading="lazy"
                />
              </div>
            </div>
          )}

          {/* Pinned Posts (Parity with Wall) */}
          {pinnedPosts.length > 0 && (
            <section>
              <h2 className="text-lg font-semibold text-foreground mb-4 flex items-center gap-2">
                <Pin className="h-5 w-5 text-amber-600" /> Pinned Posts
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {pinnedPosts.map(post => (
                  <Card key={post.id} className="overflow-hidden shadow-sm border-primary/10 hover:border-primary/20 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Pin className="h-3.5 w-3.5 text-amber-600 fill-amber-600" />
                          <span className="text-sm font-semibold truncate">
                            {post.title || 'Pinned Post'}
                          </span>
                          {post.originalPostId && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-100 text-amber-700 border-amber-200">
                              Shared from Journal
                            </Badge>
                          )}
                        </div>
                        {post.moodTag && (
                          <span className="text-xs text-muted-foreground">
                            {moodsData.find(m => m.slug === post.moodTag)?.emoji} {post.moodTag}
                          </span>
                        )}
                      </div>
                      {post.imageUrl && (
                        <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-md">
                          <img src={post.imageUrl} alt={post.title || 'Image'} className="w-full h-full object-cover" />
                        </div>
                      )}
                      {post.content && (
                        <p className="text-sm text-foreground whitespace-pre-line line-clamp-4 leading-relaxed">
                          {post.content}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          )}

          {/* Custom Blocks */}
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

      <BondRequestDialog 
        isOpen={showBondDialog} 
        onOpenChange={setShowBondDialog}
        targetUserId={userId}
        targetUserName={profile.name}
        targetUserAvatar={profile.avatar}
        onSuccess={() => setHasPending(true)}
      />
    </div>
  );
}
