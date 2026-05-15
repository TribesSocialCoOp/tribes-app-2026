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
  Camera, CheckCircle2,
} from "lucide-react";


import { AddBlockDialog } from '@/components/dialogs/add-block-dialog';
import { EditBlockDialog } from '@/components/dialogs/edit-block-dialog';
import { CustomizeWallSheet } from '@/components/sheets/customize-wall-sheet';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import type { TribePost } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import {
  getWallBlocks, saveWallBlock, deleteWallBlock as deleteWallBlockAction,
  getWallStyle, saveWallStyle,
} from '@/lib/actions/profile-actions';
import {
  getPinnedWallPosts, getCurrentMood, togglePinToWall, unpinWallClone,
} from '@/lib/actions/content-actions';

import HtmlBlock from '@/components/wall-blocks/html-block';
import MusicBlock from '@/components/wall-blocks/music-block';
import VideoBlock from '@/components/wall-blocks/video-block';
import { cn } from '@/lib/utils';
import { useUser } from '@/hooks/use-user';
import { updateUserProfile } from '@/lib/actions/profile-actions';
import { uploadFile } from '@/lib/upload';

import { moodsData } from '@/lib/moods-data';
import { AuthGuard } from '@/components/providers/auth-guard';
import { getEmbedUrl } from '@/lib/media-embeds';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';

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

/**
 * Normalize legacy light-only background color values to theme-aware equivalents.
 * Users who saved wall colors before dark-mode support will have values like
 * 'bg-slate-200' without a dark: counterpart — this maps them forward.
 */
const LEGACY_BG_MAP: Record<string, string> = {
  'bg-slate-200': 'bg-slate-200 dark:bg-slate-800',
  'bg-blue-100':  'bg-blue-100 dark:bg-blue-950',
  'bg-green-100': 'bg-green-100 dark:bg-green-950',
  'bg-pink-100':  'bg-pink-100 dark:bg-pink-950',
};

function normalizeWallBg(bg: string): string {
  return LEGACY_BG_MAP[bg] ?? bg;
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
  const { user, refresh: refreshUser } = useUser();
  const { toast } = useToast();

  const [givenName, setGivenName] = useState(user?.name || "");
  const [bio, setBio] = useState(user?.bio || "");
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  // Identity save statuses
  const [nameSaveStatus, setNameSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [bioSaveStatus, setBioSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedName = React.useRef(user?.name || "");
  const lastSavedBio = React.useRef(user?.bio || "");
  const savedFadeRef = React.useRef<NodeJS.Timeout | null>(null);


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
  const [nowPlayingInput, setNowPlayingInput] = useState('');
  const [isEditingNowPlaying, setIsEditingNowPlaying] = useState(false);
  const [isRemoveNowPlayingOpen, setIsRemoveNowPlayingOpen] = useState(false);

  // ─── Identity Autosave ──────────────────────────────────────────────────

  const autoSaveProfile = React.useCallback(async (name: string, bioVal: string) => {
    if (!user) return;
    if (name === lastSavedName.current && bioVal === lastSavedBio.current) return;

    const nameChanged = name !== lastSavedName.current;
    const bioChanged = bioVal !== lastSavedBio.current;

    if (nameChanged) setNameSaveStatus('saving');
    if (bioChanged) setBioSaveStatus('saving');
    if (savedFadeRef.current) clearTimeout(savedFadeRef.current);

    try {
      const result = await updateUserProfile(user.id, { name, bio: bioVal });
      if (result.success) {
        lastSavedName.current = name;
        lastSavedBio.current = bioVal;
        if (nameChanged) {
          refreshUser();
          setNameSaveStatus('saved');
        }
        if (bioChanged) setBioSaveStatus('saved');
        
        savedFadeRef.current = setTimeout(() => {
          setNameSaveStatus('idle');
          setBioSaveStatus('idle');
        }, 2000);
      } else {
        if (nameChanged) setNameSaveStatus('error');
        if (bioChanged) setBioSaveStatus('error');
        toast({ variant: 'destructive', title: 'Save Failed', description: result.error });
      }
    } catch {
      if (nameChanged) setNameSaveStatus('error');
      if (bioChanged) setBioSaveStatus('error');
    }
  }, [user, refreshUser, toast]);

  useEffect(() => {
    const timer = setTimeout(() => {
      autoSaveProfile(givenName, bio);
    }, 1000);
    return () => clearTimeout(timer);
  }, [givenName, bio, autoSaveProfile]);

  const handleAvatarUpload = async (file: File) => {
    if (!user) return;
    setIsUploadingAvatar(true);
    try {
      const { normalizeImage } = await import('@/lib/image-utils');
      const normalizedFile = await normalizeImage(file);
      const url = await uploadFile(normalizedFile, 'avatars', 'avatar');
      const result = await updateUserProfile(user.id, { avatar: url });
      if (result.success) {
        refreshUser();
        toast({ title: 'Avatar updated', description: 'Your profile picture has been changed.' });
      } else {
        toast({ variant: 'destructive', title: 'Upload failed', description: result.error });
      }
    } catch (err: unknown) {
      toast({ 
        variant: 'destructive', 
        title: 'Upload failed', 
        description: ((err instanceof Error) ? err.message : 'An error occurred') 
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };


  // Dialogs
  const [isAddBlockDialogOpen, setIsAddBlockDialogOpen] = useState(false);
  const [isCustomizeSheetOpen, setIsCustomizeSheetOpen] = useState(false);
  const [editingBlock, setEditingBlock] = useState<WallBlock | null>(null);
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
        wallStyle.backgroundColor = normalizeWallBg(wallStyle.backgroundColor);
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

  const handleEditBlockSave = async (blockId: string, newContent: any) => {
    setBlocks(prev => prev.map(b => b.id === blockId ? { ...b, content: newContent } : b));
    try {
      const block = blocks.find(b => b.id === blockId);
      if (block) {
        await saveWallBlock({ id: blockId, type: block.type, content: JSON.stringify(newContent), sortOrder: blocks.indexOf(block) });
      }
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
      const post = pinnedPosts.find(p => p.id === postId);
      if (post?.originalPostId) {
        // It's a clone, delete it
        await unpinWallClone(postId);
      } else {
        // It's a direct pin, toggle it
        await togglePinToWall(postId);
      }
      setPinnedPosts(prev => prev.filter(p => p.id !== postId));
      toast({ title: 'Unpinned', description: 'Post removed from your wall.' });
    } catch (error) {
      console.error('Unpin failed:', error);
      toast({ title: 'Error', description: 'Could not unpin post.', variant: 'destructive' });
    }
  };


  const handleDeleteBlock = async (blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    try {
      await deleteWallBlockAction(blockId);
      toast({ title: 'Block deleted' });
    } catch {
      toast({ title: 'Error deleting block', variant: 'destructive' });
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
  const initials = (givenName || user?.name || 'U').substring(0, 2).toUpperCase();

  const SaveIndicator = ({ status }: { status: 'idle' | 'saving' | 'saved' | 'error' }) => {
    if (status === 'idle') return null;
    if (status === 'saving') return <span className="text-[10px] text-muted-foreground animate-pulse ml-2">Saving...</span>;
    if (status === 'saved') return <span className="text-[10px] text-green-500 font-medium ml-2 flex items-center gap-0.5"><CheckCircle2 className="h-3 w-3" /> Saved</span>;
    if (status === 'error') return <span className="text-[10px] text-destructive font-medium ml-2">Error saving</span>;
    return null;
  };


  return (
    <div className={cn("p-4 md:p-6 rounded-lg transition-colors", styles.backgroundColor)}>
      <div className="space-y-8 max-w-3xl mx-auto">

        {/* ─── Profile Header ────────────────────────────────────────── */}
        <div className="flex flex-col items-center text-center gap-6 py-8">
          <div className="relative group">
            <Avatar className="h-28 w-28 ring-4 ring-background shadow-xl transition-transform hover:scale-105 duration-300">
              {user?.avatar && <AvatarImage src={user.avatar} alt={givenName || 'User'} />}
              <AvatarFallback className="text-3xl font-bold bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <button 
              className={cn(
                "absolute inset-0 flex flex-col items-center justify-center bg-black/40 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-200 cursor-pointer",
                isUploadingAvatar && "opacity-100"
              )}
              onClick={() => avatarInputRef.current?.click()}
              disabled={isUploadingAvatar}
            >
              {isUploadingAvatar ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <>
                  <Camera className="h-6 w-6 mb-1" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">Change</span>
                </>
              )}
            </button>
            <input 
              type="file" 
              ref={avatarInputRef} 
              className="hidden" 
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleAvatarUpload(file);
              }}
            />
          </div>

          <div className="w-full max-w-md space-y-4">
            <div className="space-y-1">
              <div className="flex items-center justify-center gap-2">
                <input
                  value={givenName}
                  onChange={(e) => setGivenName(e.target.value)}
                  className="text-3xl font-bold tracking-tight text-foreground bg-transparent border-none text-center focus:outline-none focus:ring-0 w-full placeholder:opacity-50"
                  placeholder="Your Name"
                />
              </div>
              <div className="h-4 flex items-center justify-center">
                <SaveIndicator status={nameSaveStatus} />
              </div>
            </div>

            <div className="space-y-1">
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={2}
                className="text-muted-foreground text-sm sm:text-base max-w-lg mx-auto bg-transparent border-none text-center focus:outline-none focus:ring-0 w-full resize-none placeholder:opacity-50"
                placeholder="Tell the world about yourself..."
              />
              <div className="h-4 flex items-center justify-center">
                <SaveIndicator status={bioSaveStatus} />
              </div>
            </div>
          </div>


          {/* Current Mood (Task 4.3) */}
          {currentMood && (
            <TooltipProvider delayDuration={300}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="secondary" className="text-sm px-3 py-1 cursor-help">
                    <span className="mr-1.5">{currentMood.emoji}</span> {currentMood.name}
                  </Badge>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Your current mood, generated automatically from your most recent post.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-destructive hover:text-destructive"
                    onClick={() => setIsRemoveNowPlayingOpen(true)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
                <div className="rounded-lg overflow-hidden shadow-sm border">
                  <iframe
                    src={embedUrl}
                    width="100%"
                    height={embedUrl.includes('youtube') || embedUrl.includes('vimeo') ? '200' : '152'}
                    allow="autoplay; encrypted-media; fullscreen"
                    className="border-0 block"
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
                        <CardTitle className="text-base flex items-center gap-2">
                          {post.title || 'Pinned Post'}
                          {post.originalPostId && (
                            <Badge variant="secondary" className="text-[9px] h-4 px-1 bg-amber-100 text-amber-700 border-amber-200">
                              Shared from Journal
                            </Badge>
                          )}
                        </CardTitle>
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
                    case 'html': return <HtmlBlock key={block.id} content={block.content} onEdit={() => setEditingBlock(block)} />;
                    case 'music': return <MusicBlock key={block.id} content={block.content} onEdit={() => setEditingBlock(block)} />;
                    case 'video': return <VideoBlock key={block.id} content={block.content} onEdit={() => setEditingBlock(block)} />;
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
      <EditBlockDialog
        isOpen={!!editingBlock}
        onOpenChange={(open) => !open && setEditingBlock(null)}
        block={editingBlock}
        onSave={handleEditBlockSave}
        onDelete={handleDeleteBlock}
      />
      <ConfirmActionDialog
        open={isRemoveNowPlayingOpen}
        onOpenChange={setIsRemoveNowPlayingOpen}
        title="Remove Now Playing"
        description="Are you sure you want to remove the currently playing track from your wall?"
        confirmText="Remove"
        destructive={true}
        onConfirm={() => {
          setNowPlayingInput('');
          setNowPlayingUrl('');
          saveWallStyle({ ...styles, nowPlayingUrl: '' } as any).catch(() => {});
        }}
      />
    </div>
  );
}
