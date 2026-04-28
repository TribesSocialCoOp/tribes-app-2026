"use client";

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  PlusCircle, Brush, Loader2, Pin, Music, ExternalLink,
  Pencil, Check, X, Megaphone, BookLock, ChevronDown, ChevronUp,
} from "lucide-react";

import { AddBlockDialog } from '@/components/dialogs/add-block-dialog';
import { CustomizeWallSheet } from '@/components/sheets/customize-wall-sheet';

import type { TribePost } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  getWallBlocks, saveWallBlock, deleteWallBlock as deleteWallBlockAction,
  getWallStyle, saveWallStyle,
} from '@/lib/actions/profile-actions';
import {
  getPinnedWallPosts, getCurrentMood, togglePinToWall,
} from '@/lib/actions/content-actions';
import HtmlBlock from '@/components/wall-blocks/html-block';
import MusicBlock from '@/components/wall-blocks/music-block';
import VideoBlock from '@/components/wall-blocks/video-block';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { moodsData } from '@/lib/moods-data';
import { AuthGuard } from '@/components/providers/auth-guard';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface WallBlock {
  id: string;
  type: 'html' | 'music' | 'video';
  content: any;
}

export interface WallStyles {
  backgroundColor: string;
  layout: 'single-column' | 'two-column';
  nowPlayingUrl?: string;
}

// ─── Page ────────────────────────────────────────────────────────────────────


export default function MyWallPage() {
  return (
    <AuthGuard message="Sign in to view and customize your personal wall.">
      <WallContent />
    </AuthGuard>
  );
}

function WallContent() {
  const { user } = useUser();
  const name = user?.name;
  const avatar = user?.avatar;
  const bio = user?.bio;
  const { toast } = useToast();

  // Wall state
  const [blocks, setBlocks] = useState<WallBlock[]>([]);
  const [styles, setStyles] = useState<WallStyles>({
    backgroundColor: 'bg-background',
    layout: 'single-column',
  });
  const [isLoadingWall, setIsLoadingWall] = useState(true);

  // Pinned posts (Task 4.1)
  const [pinnedPosts, setPinnedPosts] = useState<TribePost[]>([]);

  // Current mood (Task 4.3)
  const [currentMood, setCurrentMood] = useState<{ slug: string; emoji: string; name: string } | null>(null);

  // Now Playing (Task 4.4)
  const [nowPlayingUrl, setNowPlayingUrl] = useState('');
  const [isEditingNowPlaying, setIsEditingNowPlaying] = useState(false);
  const [nowPlayingInput, setNowPlayingInput] = useState('');

  // Dialogs
  const [isAddBlockDialogOpen, setIsAddBlockDialogOpen] = useState(false);
  const [isCustomizeSheetOpen, setIsCustomizeSheetOpen] = useState(false);
  const [showBlocks, setShowBlocks] = useState(true);

  // ─── Data Loading ────────────────────────────────────────────────────────

  useEffect(() => {
    const loadAll = async () => {
      setIsLoadingWall(true);
      try {
        const [dbBlocks, dbStyle, pinned, mood] = await Promise.all([
          getWallBlocks(),
          getWallStyle(),
          getPinnedWallPosts(),
          getCurrentMood(),
        ]);

        // Wall blocks (no longer includes my-posts, filtered out)
        setBlocks(
          dbBlocks
            .filter(b => b.type !== 'my-posts')
            .map(b => ({
              id: b.id,
              type: b.type as WallBlock['type'],
              content: JSON.parse(b.content),
            }))
        );

        const wallStyle = dbStyle as WallStyles;
        setStyles(wallStyle);
        setNowPlayingUrl(wallStyle.nowPlayingUrl || '');

        // Pinned posts
        setPinnedPosts(pinned);

        // Current mood
        if (mood) {
          const moodDef = moodsData.find(m => m.slug === mood.moodTag);
          if (moodDef) {
            setCurrentMood({ slug: moodDef.slug, emoji: moodDef.emoji, name: moodDef.name });
          }
        }
      } catch {
        // fallback
      } finally {
        setIsLoadingWall(false);
      }
    };
    loadAll();
  }, []);

  // ─── Now Playing ──────────────────────────────────────────────────────────

  const handleSaveNowPlaying = async () => {
    setNowPlayingUrl(nowPlayingInput.trim());
    setIsEditingNowPlaying(false);
    try {
      await saveWallStyle({ ...styles, nowPlayingUrl: nowPlayingInput.trim() } as any);
    } catch { /* ignore */ }
  };

  const getEmbedUrl = (url: string): string | null => {
    if (!url) return null;
    // Spotify
    const spotifyMatch = url.match(/open\.spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/);
    if (spotifyMatch) return `https://open.spotify.com/embed/${spotifyMatch[1]}/${spotifyMatch[2]}?theme=0`;
    // YouTube
    const ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}?rel=0`;
    // SoundCloud — just use the URL
    if (url.includes('soundcloud.com')) return `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&visual=true`;
    return null;
  };

  // ─── Block Management ────────────────────────────────────────────────────

  const handleAddBlock = async (blockType: 'html' | 'music' | 'video') => {
    let newBlock: WallBlock;
    switch (blockType) {
      case 'html':
        newBlock = { id: `block-${Date.now()}`, type: 'html', content: { html: '<p>New HTML Block - Edit me!</p>' } };
        break;
      case 'music':
        newBlock = { id: `block-${Date.now()}`, type: 'music', content: { trackUrl: '' } };
        break;
      case 'video':
        newBlock = { id: `block-${Date.now()}`, type: 'video', content: { videoUrl: '' } };
        break;
      default: return;
    }
    setBlocks(prev => [...prev, newBlock]);
    setIsAddBlockDialogOpen(false);
    try {
      await saveWallBlock({ id: newBlock.id, type: newBlock.type, content: JSON.stringify(newBlock.content), sortOrder: blocks.length });
    } catch { /* ignore */ }
  };

  const handleSaveStyles = async (newStyles: WallStyles) => {
    setStyles(newStyles);
    setIsCustomizeSheetOpen(false);
    try {
      await saveWallStyle(newStyles);
    } catch { /* ignore */ }
  };

  const handleUnpin = async (postId: string) => {
    try {
      await togglePinToWall(postId);
      setPinnedPosts(prev => prev.filter(p => p.id !== postId));
      toast({ title: 'Unpinned', description: 'Post removed from your wall.' });
    } catch {
      toast({ title: 'Error', description: 'Could not unpin post.', variant: 'destructive' });
    }
  };

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoadingWall) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
      </div>
    );
  }

  const embedUrl = getEmbedUrl(nowPlayingUrl);
  const initials = (name || 'U').substring(0, 2).toUpperCase();

  return (
    <div className={cn("p-4 md:p-6 rounded-lg transition-colors", styles.backgroundColor)}>
      <div className="space-y-8 max-w-3xl mx-auto">

        {/* ─── Profile Header (Task 4.5) ──────────────────────────────── */}
        <div className="flex flex-col items-center text-center gap-4 py-6">
          <Avatar className="h-24 w-24 ring-4 ring-background shadow-lg">
            {avatar && <AvatarImage src={avatar} alt={name || 'You'} />}
            <AvatarFallback className="text-2xl font-bold">{initials}</AvatarFallback>
          </Avatar>

          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-normal text-foreground font-mono">{name || 'Your Wall'}</h1>
            {bio && <p className="text-sm text-muted-foreground mt-1 max-w-md">{bio}</p>}
          </div>

          {/* Current Mood (Task 4.3) */}
          {currentMood && (
            <Badge variant="secondary" className="text-sm px-3 py-1">
              <span className="mr-1.5">{currentMood.emoji}</span> Feeling {currentMood.name}
            </Badge>
          )}

          {/* Now Playing (Task 4.4) */}
          <div className="w-full max-w-sm">
            {isEditingNowPlaying ? (
              <div className="flex gap-2 items-center">
                <Input
                  placeholder="Paste Spotify, YouTube, or SoundCloud URL..."
                  value={nowPlayingInput}
                  onChange={(e) => setNowPlayingInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveNowPlaying()}
                  className="text-sm"
                  autoFocus
                />
                <Button size="icon" variant="ghost" onClick={handleSaveNowPlaying}>
                  <Check className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => setIsEditingNowPlaying(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : nowPlayingUrl && embedUrl ? (
              <div className="space-y-2">
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Music className="h-3.5 w-3.5 animate-pulse text-primary" />
                  <span className="font-medium">Now Playing</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5"
                    onClick={() => { setNowPlayingInput(nowPlayingUrl); setIsEditingNowPlaying(true); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden shadow-sm border">
                  <iframe
                    src={embedUrl}
                    width="100%"
                    height={embedUrl.includes('youtube') ? '200' : '80'}
                    allow="autoplay; encrypted-media"
                    className="border-0"
                    loading="lazy"
                  />
                </div>
              </div>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => { setNowPlayingInput(nowPlayingUrl); setIsEditingNowPlaying(true); }}
              >
                <Music className="mr-1.5 h-4 w-4" /> Add Now Playing
              </Button>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            <Button variant="outline" size="sm" onClick={() => setIsAddBlockDialogOpen(true)}>
              <PlusCircle className="mr-2 h-4 w-4" /> Add Block
            </Button>
            <Button variant="outline" size="sm" onClick={() => setIsCustomizeSheetOpen(true)}>
              <Brush className="mr-2 h-4 w-4" /> Customize
            </Button>
          </div>
        </div>

        {/* ─── Pinned Posts Section (Task 4.1) ────────────────────────── */}
        <section>
          <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
            <Pin className="h-5 w-5 text-amber-600" /> Pinned Posts
          </h2>
          {pinnedPosts.length > 0 ? (
            <div className="space-y-4">
              {pinnedPosts.map(post => (
                <Card key={post.id} className="overflow-hidden shadow-sm">
                  <CardHeader className="p-4 pb-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Pin className="h-3.5 w-3.5 text-amber-600 fill-amber-600" />
                        <CardTitle className="text-base">{post.title || 'Pinned Post'}</CardTitle>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive text-xs"
                        onClick={() => handleUnpin(post.id)}
                      >
                        Unpin
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      {post.moodTag && (
                        <CardDescription className="text-xs">
                          {moodsData.find(m => m.slug === post.moodTag)?.emoji} {post.moodTag}
                        </CardDescription>
                      )}
                      {post.editedAt && (
                        <span className="text-[10px] text-muted-foreground/60 italic">
                          (edited)
                        </span>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="p-4 pt-2">
                    {post.imageUrl && (
                      <div className="mb-3 relative aspect-video w-full overflow-hidden rounded-md">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={post.imageUrl} alt={post.title || 'Image'} className="w-full h-full object-cover" />
                      </div>
                    )}
                    {post.content && (
                      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{post.content}</p>
                    )}
                  </CardContent>
                  {(post.vibes ?? 0) > 0 && (
                    <CardFooter className="p-4 pt-0 text-xs text-muted-foreground">
                      {post.vibes! > 0 && <span>{post.vibes} vibes</span>}
                      {(post.comments ?? 0) > 0 && (
                        <span className="ml-3">{post.comments} comments</span>
                      )}
                    </CardFooter>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <Card className="text-center py-8 shadow-none border-dashed">
              <CardContent className="p-4">
                <BookLock className="mx-auto h-10 w-10 text-muted-foreground opacity-50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Your pinned journal posts will appear here.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Write a journal entry from your Feed, then tap 📌 Pin to add it to your wall.
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* ─── Custom Blocks Section ──────────────────────────────────── */}
        {blocks.length > 0 && (
          <section>
            <button
              className="flex items-center gap-2 text-lg font-semibold text-foreground mb-3 hover:text-primary transition-colors"
              onClick={() => setShowBlocks(!showBlocks)}
            >
              <Megaphone className="h-5 w-5 text-primary" /> Custom Blocks
              {showBlocks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {showBlocks && (
              <div className={cn(
                "space-y-6",
                styles.layout === 'two-column' && "md:grid md:grid-cols-2 md:gap-6 md:space-y-0"
              )}>
                {blocks.map(block => {
                  switch (block.type) {
                    case 'html': return <HtmlBlock key={block.id} content={block.content} />;
                    case 'music': return <MusicBlock key={block.id} content={block.content} />;
                    case 'video': return <VideoBlock key={block.id} content={block.content} />;
                    default: return null;
                  }
                })}
              </div>
            )}
          </section>
        )}
      </div>

      {/* Dialogs */}
      <AddBlockDialog
        isOpen={isAddBlockDialogOpen}
        onOpenChange={setIsAddBlockDialogOpen}
        onAddBlock={handleAddBlock}
      />
      <CustomizeWallSheet
        isOpen={isCustomizeSheetOpen}
        onOpenChange={setIsCustomizeSheetOpen}
        currentStyles={styles}
        onSave={handleSaveStyles}
      />
    </div>
  );
}
