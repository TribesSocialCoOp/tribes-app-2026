"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useOptimisticVibes } from '@/hooks/use-optimistic-vibes';
import { useUser } from '@/hooks/use-user';
import { useIsMobile } from '@/hooks/use-mobile';
import { useDoubleTap } from '@/hooks/use-double-tap';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Smile, SquareArrowUp, MessageSquareText, MoreVertical, Flag, Rss, RefreshCcw, Pin, Trash2, ShieldAlert, Pencil, Lock, Globe, UserRoundX, Send, Loader2, Link2, ChevronDown, ChevronRight } from "lucide-react";
import { createComment } from '@/lib/actions/content-actions';
import { useToast } from '@/hooks/use-toast';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistance } from 'date-fns';
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { cn } from '@/lib/utils';
import { useTimeSince } from '@/hooks/use-time-since';
import { VibePicker } from '@/components/ui/vibe-picker';
import type { TribePost, DiscussionComment } from '@/lib/types';
import { CommentCard } from './comment-card';
import { EditSlugDialog } from '@/components/dialogs/edit-slug-dialog';
import { useTribeDetail } from './tribe-detail-context';
import { MarkdownContent, getReferencedImageIndices } from '@/components/ui/markdown-content';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { EncryptedImage } from '@/components/ui/encrypted-image';
import { LinkPreviewCard } from '@/components/ui/link-preview-card';
import { InlineReplyBox } from '@/components/content/inline-reply-box';
import { ThreadCollapseHeader } from '@/components/content/thread-collapse-header';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { triggerHaptic } from '@/lib/capacitor/haptics';
import { ImpactStyle } from '@capacitor/haptics';
import { shareContent } from '@/lib/capacitor/share';
import { RoleBadge } from '@/components/ui/role-badge';
import { buildPostPath } from '@/lib/utils/slugify';
import { profilePath } from '@/lib/utils/paths';

interface TribePostCardProps {
  post: TribePost;
  isPromoted: boolean;
  isReported: boolean;
  isCurrentUserAuthor: boolean;
}

export const TribePostCard: React.FC<TribePostCardProps> = ({
  post, isPromoted, isReported, isCurrentUserAuthor,
}) => {
  const {
    state, isLoggedIn, currentUserId, isTribeAdmin, isTribeSpeaker, isGlobalAdmin,
    handleOpenPromoteDialog, handleOpenReportPostDialog,
    handleOpenRepostDialog, handleOpenReportCommentDialog,
    handleOpenCommentDialog, handleDeletePost,
    handleTogglePinPost, handleOpenModRemoveDialog, handleAdminDeletePost,
    handleOpenEditPostDialog, memberRoleMap, syncAllData,
  } = useTribeDetail();

  const router = useRouter();
  const { toast } = useToast();
  const { user } = useUser();
  const tribeId = state.tribe?.id;
  const isMobile = useIsMobile();

  const isMember = state.isMember;
  const displayTime = useTimeSince(post.timestamp);

  const isTribeFounder = state.tribe?.createdBy === currentUserId || memberRoleMap.get(currentUserId || '') === 'founder';
  const isTribeLeader = isTribeFounder || isTribeSpeaker || isGlobalAdmin;
  const canEditSlug = !!(isGlobalAdmin || isTribeFounder || isTribeSpeaker || (isCurrentUserAuthor && !post.slugEditedBy));
  const isSlugLocked = !!(isCurrentUserAuthor && post.slugEditedBy && !isTribeLeader);

  // ── Optimistic vibes (consolidated hook) ──
  const {
    vibeCount: currentVibesCount,
    recentVibes: currentRecentVibes,
    vibeDetails: currentVibeDetails,
    hasVibed: currentUserHasVibed,
    handleVibeSelection,
  } = useOptimisticVibes({
    targetId: post.id,
    targetType: 'post',
    serverVibeCount: post.vibes || 0,
    serverRecentVibes: post.recentVibes || [],
    serverVibeDetails: post.vibeDetails || [],
    serverHasVibed: post.hasVibed || false,
    serverSelectedVibe: post.selectedVibe ?? null,
    canSeeReactors: isCurrentUserAuthor,
    currentUserId,
    currentUserName: user?.name,
  });

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);


  // Inline reply state
  const [showInlineReply, setShowInlineReply] = useState(false);
  const [inlineReplyText, setInlineReplyText] = useState('');
  const [isSendingInlineReply, setIsSendingInlineReply] = useState(false);

  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [isBodyCollapsed, setIsBodyCollapsed] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Mobile: double-tap ⋮ menu button to toggle body collapse
  const handleMenuDoubleTap = useDoubleTap({
    onDoubleTap: useCallback(() => {
      setIsBodyCollapsed(prev => !prev);
      triggerHaptic(ImpactStyle.Light);
    }, []),
    onSingleTap: useCallback(() => {
      setIsMenuOpen(true);
    }, []),
  });
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);
  const [isAdminDeleteDialogOpen, setIsAdminDeleteDialogOpen] = useState(false);
  const [isEditSlugDialogOpen, setIsEditSlugDialogOpen] = useState(false);
  const inlineReplyRef = useRef<HTMLDivElement>(null);

  const handleSendInlineReply = async () => {
    if (!inlineReplyText.trim()) return;
    setIsSendingInlineReply(true);
    try {
      // Encrypt comment for private tribes
      let encPayload: { ciphertextBase64: string; iv: string } | undefined;
      if (tribeId && state.tribe && !state.tribe.isPublic) {
        const { getTribeKey } = await import('@/lib/crypto/key-store');
        const cachedTribeKey = await getTribeKey(tribeId);
        if (!cachedTribeKey) {
          throw new Error('Encryption keys have not synced yet. Please wait a moment and try again.');
        }
        const { encryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
        const { toBase64 } = await import('@/lib/crypto/encoding');
        const encrypted = await encryptWithTribeKey(inlineReplyText.trim(), cachedTribeKey.key);
        encPayload = {
          ciphertextBase64: toBase64(encrypted.ciphertext),
          iv: encrypted.iv,
        };
      }

      const result = await createComment(post.id, inlineReplyText.trim(), undefined, encPayload);
      if (result && typeof result === 'object' && 'serverError' in result) {
        throw new Error(result.serverError as string);
      }
      toast({ title: 'Reply sent', description: 'Your comment has been posted.' });
      setInlineReplyText('');
      setShowInlineReply(false);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSendingInlineReply(false);
    }
  };

  // ── Encrypted post text decryption ──────────────────────────
  const [decryptedContent, setDecryptedContent] = useState<string | null>(null);
  const [decryptionStatus, setDecryptionStatus] = useState<'decrypting' | 'success' | 'missing_key' | 'key_mismatch' | 'failed' | 'idle'>(post.isEncrypted ? 'decrypting' : 'idle');

  useEffect(() => {
    if (!post.isEncrypted || !post.ciphertextBase64 || !post.encryptionIv) return;

    let active = true;

    async function decryptText() {
      try {
        const effectiveTribeId = post.tribeId || tribeId;

        if (effectiveTribeId) {
          // TRIBE PATH: try tribe group key first
          const { getTribeKey } = await import('@/lib/crypto/key-store');
          const cachedTribeKey = await getTribeKey(effectiveTribeId);

          if (cachedTribeKey) {
            const { decryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
            const { fromBase64 } = await import('@/lib/crypto/encoding');
            const ciphertextBuffer = fromBase64(post.ciphertextBase64!);
            const plaintext = await decryptWithTribeKey(
              ciphertextBuffer,
              post.encryptionIv!,
              cachedTribeKey.key,
            );
            if (active) {
              setDecryptedContent(plaintext);
              setDecryptionStatus('success');
            }
            return;
          }
        }

        // GRANT-BASED FALLBACK: use key grants (pairwise encryption)
        const { getPostKeyGrants } = await import('@/lib/actions/content-actions');
        const grants = await getPostKeyGrants([post.id]);
        const grant = grants[post.id];

        if (!grant) {
          if (active) setDecryptionStatus('missing_key');
          return;
        }

        const { decryptPost } = await import('@/lib/crypto/post-encryption');
        const { fromBase64 } = await import('@/lib/crypto/encoding');
        const { getSharedSecret } = await import('@/lib/crypto/key-store');

        let unwrapSecret: CryptoKey;

        if (!grant.bondId) {
          const { getOrCreateJournalKey } = await import('@/lib/crypto/journal-encryption');
          unwrapSecret = await getOrCreateJournalKey();
        } else {
          const cached = await getSharedSecret(grant.bondId);
          if (cached) {
            unwrapSecret = cached.sharedSecret;
          } else {
            const { getBondKey, importPublicKey, deriveSharedSecret } = await import('@/lib/crypto');
            const bondKey = await getBondKey(grant.bondId);
            if (!bondKey) { if (active) setDecryptionStatus('missing_key'); return; }
            const { getBonds } = await import('@/lib/actions/bond-actions');
            const bonds = await getBonds();
            const bond = bonds.find(b => b.id === grant.bondId);
            if (!bond?.peerPublicKeyJwk) { if (active) setDecryptionStatus('missing_key'); return; }
            const partnerPubKey = await importPublicKey(JSON.parse(bond.peerPublicKeyJwk));
            unwrapSecret = await deriveSharedSecret(bondKey.privateKey, partnerPubKey);
          }
        }

        const ciphertextBuffer = fromBase64(post.ciphertextBase64!);
        const plaintext = await decryptPost(
          ciphertextBuffer,
          post.encryptionIv!,
          grant.wrappedKey,
          grant.wrapIv,
          unwrapSecret,
        );
        if (active) {
          setDecryptedContent(plaintext);
          setDecryptionStatus('success');
        }
      } catch (err) {
        console.error('[TribePostCard] Decryption failed:', err);
        if (active) {
          if (err instanceof DOMException && err.name === 'OperationError') {
            setDecryptionStatus('key_mismatch');
          } else {
            setDecryptionStatus('failed');
          }
        }
      }
    }

    decryptText();
    return () => { active = false; };
  }, [post.id, post.isEncrypted, post.ciphertextBase64, post.encryptionIv, post.tribeId, tribeId]);

  // Display content: decrypted text for encrypted posts, raw content for public
  const displayContent = post.isEncrypted ? (decryptedContent ?? '') : post.content;

  return (
    <Card className={cn(
      "overflow-visible shadow-none sm:shadow-lg relative",
      isPromoted && "bg-accent/5 hover:bg-accent/10 border-accent/30",
      isReported && !post.isRemoved && "border-destructive/50 ring-2 ring-destructive/30",
      post.isPinned && "border-primary/50 ring-2 ring-primary/30"
    )}>
    {post.isRemoved ? (
      /* ── Tombstone: scrubbed content — nothing from the original post is in the DOM ── */
      <div className="p-6 flex flex-col items-center justify-center text-center space-y-3 min-h-[120px]">
        <Badge variant="destructive" className="text-md p-2 px-3">POST REMOVED</Badge>
        {post.removalReason && (
          <p className="text-xs text-muted-foreground italic max-w-xs">
            Reason: {post.removalReason}
          </p>
        )}
        {!post.canBeReposted && post.removalReason && (
          <p className="text-xs text-destructive font-semibold max-w-xs">
            Reposting of this content has been prevented by moderation.
          </p>
        )}
        <div className="flex gap-2 mt-2">
          {isCurrentUserAuthor && post.canBeReposted !== false && (
            <Button variant="secondary" size="sm" onClick={() => handleOpenRepostDialog(post)}>
              <RefreshCcw className="mr-1.5 h-4 w-4" /> Repost
            </Button>
          )}
          {isGlobalAdmin && (
            <Button variant="destructive" size="sm" onClick={() => setIsAdminDeleteDialogOpen(true)}>
              <Trash2 className="mr-1.5 h-4 w-4" /> Delete Permanently
            </Button>
          )}
        </div>
      </div>
    ) : (
      <div>
        <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
          <div className="flex items-start space-x-3">
            {!post.authorIsAlias ? (
              <Link href={profilePath(post.authorId, post.authorSlug)} className="shrink-0">
                <UserAvatar
                  user={{ name: post.authorName, avatar: post.authorAvatar }}
                  className="h-10 w-10 cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all"
                  fallback={post.authorAvatarFallback}
                  dataAiHint={post.dataAiHintAvatar || "avatar"}
                />
              </Link>
            ) : (
              <UserAvatar
                user={{ name: post.authorName, avatar: post.authorAvatar }}
                className="h-10 w-10 shrink-0"
                fallback={post.authorAvatarFallback}
                dataAiHint={post.dataAiHintAvatar || "avatar"}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                {!post.authorIsAlias ? (
                  <Link href={profilePath(post.authorId, post.authorSlug)} className="hover:underline decoration-primary/30 underline-offset-2">
                    <CardTitle className="text-md font-semibold tracking-normal truncate">{post.authorName}</CardTitle>
                  </Link>
                ) : (
                  <CardTitle className="text-md font-semibold tracking-normal truncate">{post.authorName}</CardTitle>
                )}
                <RoleBadge role={memberRoleMap.get(post.authorId) || 'member'} tribeName={state.tribe?.name} showLabel={!isMobile} />
              </div>
              <div className="flex items-center space-x-2">
                <CardDescription className="text-xs hover:underline">
                  <Link href={buildPostPath(post.id, post.slug, state.tribe?.slug)}>
                    {displayTime}
                  </Link>
                  {post.editedAt && (
                    <span className="text-muted-foreground/70 ml-1" title={`Edited ${formatDistance(post.editedAt, new Date(), { addSuffix: true })}`}>
                      (edited)
                    </span>
                  )}
                </CardDescription>
                {post.isEncrypted ? (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <button type="button" className="flex items-center text-xs text-green-600 bg-transparent border-none p-0 cursor-default"><Lock className="h-3 w-3" /></button>
                  </TooltipTrigger><TooltipContent><p>End-to-end encrypted</p></TooltipContent></Tooltip></TooltipProvider>
                ) : (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <button type="button" className="flex items-center text-xs text-muted-foreground/50 bg-transparent border-none p-0 cursor-default"><Globe className="h-3 w-3" /></button>
                  </TooltipTrigger><TooltipContent><p>Public post</p></TooltipContent></Tooltip></TooltipProvider>
                )}
                {post.isPinned && (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <button type="button" className="flex items-center text-xs text-primary bg-transparent border-none p-0 cursor-default"><Pin className="h-3.5 w-3.5" /></button>
                  </TooltipTrigger><TooltipContent><p>Pinned Post</p></TooltipContent></Tooltip></TooltipProvider>
                )}
                {isMember && isPromoted && !post.isRemoved && (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <button type="button" className="flex items-center text-xs text-accent bg-transparent border-none p-0 cursor-default"><Rss className="h-3.5 w-3.5" /></button>
                  </TooltipTrigger><TooltipContent><p>Promoted to Mood Stream</p></TooltipContent></Tooltip></TooltipProvider>
                )}
                {isReported && !post.isRemoved && (
                  <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
                    <button type="button" className="flex items-center text-xs text-destructive bg-transparent border-none p-0 cursor-default"><Flag className="h-3.5 w-3.5" /></button>
                  </TooltipTrigger><TooltipContent><p>This post has been reported and is under review.</p></TooltipContent></Tooltip></TooltipProvider>
                )}
              </div>
            </div>
            {isLoggedIn && !post.isRemoved && (
              <div className="flex items-center gap-1">
                <Link 
                  href={buildPostPath(post.id, post.slug, state.tribe?.slug)} 
                  className="p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted transition-colors" 
                  title="View Post"
                >
                  <Link2 className="h-4 w-4" />
                </Link>
                <ResponsiveMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                <ResponsiveMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 touch-target-44 text-muted-foreground"
                    onClick={isMobile ? handleMenuDoubleTap : undefined}
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </ResponsiveMenuTrigger>
                <ResponsiveMenuContent align="end">
                  <ResponsiveMenuItem onClick={() => {
                    const url = `${window.location.origin}${buildPostPath(post.id, post.slug, state.tribe?.slug)}`;
                    navigator.clipboard.writeText(url);
                    toast({ title: 'Link copied', description: 'Post link copied to clipboard.' });
                  }}>
                    <Link2 className="mr-2 h-4 w-4" /> Copy Link
                  </ResponsiveMenuItem>
                  <ResponsiveMenuItem onClick={() => {
                    setIsBodyCollapsed(!isBodyCollapsed);
                    triggerHaptic(ImpactStyle.Light);
                  }}>
                    {isBodyCollapsed ? (
                      <>
                        <ChevronDown className="mr-2 h-4 w-4" /> Expand Post
                      </>
                    ) : (
                      <>
                        <ChevronRight className="mr-2 h-4 w-4" /> Collapse Post
                      </>
                    )}
                  </ResponsiveMenuItem>
                  <ResponsiveMenuSeparator />
                  {isTribeSpeaker && (
                    <>
                      <ResponsiveMenuItem onClick={() => handleOpenPromoteDialog(post)} disabled={isPromoted}>
                        <Rss className="mr-2 h-4 w-4" /> {isPromoted ? "Already Promoted" : "Promote to Mood Stream"}
                      </ResponsiveMenuItem>
                      <ResponsiveMenuItem onClick={() => handleTogglePinPost(post.id)}>
                        <Pin className="mr-2 h-4 w-4" /> {post.isPinned ? "Unpin Post" : "Pin to Top"}
                      </ResponsiveMenuItem>
                      {isTribeSpeaker && !isCurrentUserAuthor && (
                        <ResponsiveMenuItem className="text-destructive focus:text-destructive" onClick={() => handleOpenModRemoveDialog(post)}>
                          <ShieldAlert className="mr-2 h-4 w-4" /> Remove Post (Mod)
                        </ResponsiveMenuItem>
                      )}
                      <ResponsiveMenuSeparator />
                    </>
                  )}
                  {isGlobalAdmin && (
                    <ResponsiveMenuItem className="text-destructive focus:text-destructive" onClick={() => setIsAdminDeleteDialogOpen(true)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete Post (Admin)
                    </ResponsiveMenuItem>
                  )}
                  {!isCurrentUserAuthor && (
                    <>
                      <ResponsiveMenuItem onClick={() => handleOpenReportPostDialog(post)}>
                        <Flag className="mr-2 h-4 w-4" /> Report Post
                      </ResponsiveMenuItem>
                      <ResponsiveMenuItem
                        className="text-destructive focus:text-destructive"
                        onClick={() => setIsBlockDialogOpen(true)}
                      >
                        <UserRoundX className="mr-2 h-4 w-4" /> Block User
                      </ResponsiveMenuItem>
                    </>
                  )}
                  {isCurrentUserAuthor && (
                    <>
                      <ResponsiveMenuItem onClick={() => handleOpenEditPostDialog(post)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Post
                      </ResponsiveMenuItem>
                      {isSlugLocked ? (
                        <TooltipProvider delayDuration={100}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="w-full">
                                <ResponsiveMenuItem disabled className="opacity-60 cursor-not-allowed flex items-center justify-between">
                                  <span className="flex items-center">
                                    <Link2 className="mr-2 h-4 w-4" /> Edit URL Slug
                                  </span>
                                  <Lock className="h-3.5 w-3.5 text-muted-foreground ml-2" />
                                </ResponsiveMenuItem>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Locked by a Tribe Leader</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : canEditSlug ? (
                        <ResponsiveMenuItem onClick={() => setIsEditSlugDialogOpen(true)}>
                          <Link2 className="mr-2 h-4 w-4" /> Edit URL Slug
                        </ResponsiveMenuItem>
                      ) : null}
                      {!isGlobalAdmin && (
                        <ResponsiveMenuItem className="text-destructive focus:text-destructive" onClick={() => setIsDeleteDialogOpen(true)}>
                          <Trash2 className="mr-2 h-4 w-4" /> Delete Post
                        </ResponsiveMenuItem>
                      )}
                    </>
                  )}
                  {!isCurrentUserAuthor && canEditSlug && (
                    <ResponsiveMenuItem onClick={() => setIsEditSlugDialogOpen(true)}>
                      <Link2 className="mr-2 h-4 w-4" /> Edit URL Slug (Mod)
                    </ResponsiveMenuItem>
                  )}
                </ResponsiveMenuContent>
              </ResponsiveMenu>
              {/* Desktop: chevron to collapse/expand post body */}
              <button
                onClick={() => { setIsBodyCollapsed(!isBodyCollapsed); triggerHaptic(ImpactStyle.Light); }}
                className="hidden md:flex p-1.5 text-muted-foreground hover:text-primary rounded-md hover:bg-muted transition-colors items-center justify-center"
                title={isBodyCollapsed ? "Expand post" : "Collapse post"}
              >
                {isBodyCollapsed ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-4 pt-2 sm:pt-3 relative">
          {post.title && (
            <Link href={buildPostPath(post.id, post.slug, state.tribe?.slug)} className="hover:underline decoration-primary/30 decoration-2">
              <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-tight">{post.title}</h3>
            </Link>
          )}
          {!isBodyCollapsed && (<>
          {/* Multi-image support — only show images NOT referenced inline via [img:N] */}
          {(() => {
            const allImages = post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : []);
            const inlineRefs = displayContent ? getReferencedImageIndices(displayContent) : new Set<number>();
            const headerImages = allImages.filter((_, idx) => !inlineRefs.has(idx + 1));
            
            if (headerImages.length > 0) {
              return (
                <div className={cn(
                  "mb-3 grid gap-2 overflow-hidden rounded-lg border bg-muted/20",
                  headerImages.length === 1 ? "grid-cols-1" :
                    headerImages.length === 2 ? "grid-cols-2" :
                      headerImages.length === 3 ? "grid-cols-2" :
                        "grid-cols-2"
                )}>
                  {headerImages.map((urlOrId, idx) => {
                    const origIdx = allImages.indexOf(urlOrId);
                    return (
                      <div
                        key={idx}
                        className={cn(
                          "relative overflow-hidden cursor-pointer group",
                          headerImages.length === 1
                            ? "flex items-center justify-center max-h-[500px]"
                            : "aspect-square",
                          headerImages.length === 3 && idx === 0 && "row-span-2 aspect-auto"
                        )}
                        onClick={() => { setLightboxIndex(origIdx >= 0 ? origIdx : idx); setLightboxOpen(true); }}
                      >
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors z-10" />
                        {post.isEncrypted ? (
                          <EncryptedImage fileId={urlOrId} postId={post.id} ring={post.ring || 'tribes'} tribeId={post.tribeId || tribeId} alt={`${post.imageAlt || "Post image"} ${idx + 1}`} className={cn(
                            "transition-transform duration-300 group-hover:scale-105",
                            headerImages.length === 1
                              ? "max-w-full max-h-[500px] w-auto h-auto object-contain"
                              : "w-full h-full object-cover"
                          )} />
                        ) : (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={urlOrId} alt={`${post.imageAlt || "Post image"} ${idx + 1}`} className={cn(
                            "transition-transform duration-300 group-hover:scale-105",
                            headerImages.length === 1
                              ? "max-w-full max-h-[500px] w-auto h-auto object-contain"
                              : "w-full h-full object-cover"
                          )} />
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            }
            return null;
          })()}
          {/* Post Text Content */}
          {post.isEncrypted && decryptionStatus === 'decrypting' && (
            <div className="space-y-2 animate-pulse mb-3 mt-2">
              <div className="h-4 bg-muted/60 rounded w-full"></div>
              <div className="h-4 bg-muted/60 rounded w-5/6"></div>
              <div className="h-4 bg-muted/60 rounded w-4/6"></div>
            </div>
          )}
          {post.isEncrypted && decryptionStatus === 'missing_key' && (
            <div className="flex flex-col items-center justify-center p-6 my-2 bg-secondary/30 backdrop-blur-md rounded-lg border border-border/50 shadow-inner">
              <div className="bg-background/80 p-3 rounded-full mb-3 shadow-sm">
                <Lock className="h-6 w-6 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium text-center">Content Locked</p>
              <p className="text-xs text-muted-foreground text-center mt-1.5 max-w-[250px] leading-relaxed">
                Waiting for encryption keys to sync.
              </p>
            </div>
          )}
          {post.isEncrypted && decryptionStatus === 'failed' && (
            <div className="flex items-center text-destructive bg-destructive/10 p-3 rounded-md mb-3 mt-2 border border-destructive/20">
              <Lock className="h-4 w-4 mr-2" />
              <span className="text-sm font-medium">Decryption failed.</span>
            </div>
          )}
          {post.isEncrypted && decryptionStatus === 'key_mismatch' && (
            <div className="flex items-center text-muted-foreground bg-muted/50 p-3 rounded-md mb-3 mt-2 border border-border/50">
              <Lock className="h-4 w-4 mr-2 flex-shrink-0" />
              <span className="text-sm">This post was encrypted with a previous key and can no longer be decrypted.</span>
            </div>
          )}
          {(!post.isEncrypted || decryptionStatus === 'success') && displayContent && (
            <MarkdownContent
              content={displayContent}
              imageUrls={post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : undefined)}
              isEncrypted={post.isEncrypted}
              postId={post.id}
              ring={post.ring || 'tribes'}
              tribeId={post.tribeId || tribeId}
              onImageClick={(idx) => { setLightboxIndex(idx); setLightboxOpen(true); }}
            />
          )}
          {/* Link preview card */}
          {post.linkUrl && (
            <div className="mt-2">
              <LinkPreviewCard
                url={post.linkUrl}
                title={post.linkTitle}
                description={post.linkDescription}
                imageUrl={post.linkImage}
                siteName={post.linkSiteName}
              />
            </div>
          )}
          {(post.commentsData && post.commentsData.length > 0) && (
            <div className="mt-4 pt-3 border-t">
              <ThreadCollapseHeader
                count={post.comments ?? post.commentsData.length}
                isExpanded={showComments}
                onToggle={() => setShowComments(!showComments)}
              />
              {showComments && post.commentsData.map(comment => (
                <CommentCard
                  key={comment.id}
                  comment={comment}
                  postId={post.id}
                  onReportComment={handleOpenReportCommentDialog}
                  onOpenReplyDialog={handleOpenCommentDialog}
                  isLoggedIn={isLoggedIn}
                  isMember={isMember}
                  currentUserId={currentUserId ?? undefined}
                  postAuthorId={post.authorId}
                  tribeId={tribeId}
                  onCommentAdded={syncAllData}
                  isPublic={state.tribe?.isPublic ?? true}
                />
              ))}
            </div>
          )}
          </>)}
        </CardContent>
        <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start space-x-4 border-t">
          {isLoggedIn && isMember ? (
            <VibePicker
              vibeCount={currentVibesCount}
              recentVibes={currentRecentVibes}
              vibeDetails={currentVibeDetails}
              hasVibed={currentUserHasVibed}
              isAuthor={isCurrentUserAuthor}
              onVibeSelect={handleVibeSelection}
              disabled={post.isRemoved}
            />
          ) : (
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-primary" disabled={post.isRemoved} onClick={() => { if (!isLoggedIn) router.push('/signup'); }}>
              {currentRecentVibes.length > 0 ? (
                <div className="flex -space-x-1.5 mr-2">
                  {currentRecentVibes.map((rv, i) => (
                    <span key={i} className="text-base z-10 bg-background rounded-full leading-none p-[1px] shadow-sm relative">{rv.emoji}</span>
                  ))}
                </div>
              ) : (
                <Smile className="mr-1.5 h-4 w-4" />
              )}
              {currentVibesCount}
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-primary"
            disabled={post.isRemoved}
            onClick={() => {
              triggerHaptic(ImpactStyle.Light);
              setShowComments(!showComments);
            }}
          >
            <MessageSquareText className="mr-1.5 h-4 w-4" /> {post.comments || 0}
          </Button>
          {isLoggedIn && isMember && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground hover:text-primary"
              disabled={post.isRemoved}
              onClick={() => {
                triggerHaptic(ImpactStyle.Light);
                if (isMobile) {
                  // On mobile, use the bottom-sheet comment dialog to avoid keyboard overlap
                  handleOpenCommentDialog({ postId: post.id, postTitle: post.title });
                } else {
                  setShowInlineReply(!showInlineReply);
                }
              }}
            >
              <Send className="mr-1.5 h-4 w-4" /> Reply
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-primary"
            disabled={post.isRemoved}
            onClick={() => {
              triggerHaptic(ImpactStyle.Medium);
              shareContent({
                title: post.title || 'Check out this post on Tribes',
                text: post.content.substring(0, 100),
                url: `${typeof window !== 'undefined' ? window.location.origin : ''}${buildPostPath(post.id, post.slug, state.tribe?.slug)}`
              });
            }}
          >
            <SquareArrowUp className="mr-1.5 h-4 w-4" /> Share
          </Button>
        </CardFooter>
        {!isMobile && showInlineReply && (
          <InlineReplyBox
            ref={inlineReplyRef}
            value={inlineReplyText}
            onChange={setInlineReplyText}
            onSend={handleSendInlineReply}
            isSending={isSendingInlineReply}
          />
        )}
      </div>
      )}

      <ImageLightbox
        images={post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : [])}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
        isEncrypted={post.isEncrypted}
        postId={post.id}
        ring="tribes"
        tribeId={tribeId}
      />

      <ConfirmActionDialog
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        title="Delete Post"
        description="Are you sure you want to delete this post? This action cannot be undone."
        confirmText="Delete"
        destructive={true}
        onConfirm={() => handleDeletePost(post.id)}
      />

      <ConfirmActionDialog
        open={isAdminDeleteDialogOpen}
        onOpenChange={setIsAdminDeleteDialogOpen}
        title="Permanently Delete Post (Admin)"
        description="This will permanently delete this post and all associated data (comments, vibes, reports, encryption keys). Media files will be queued for cleanup after 30 days. This cannot be undone."
        confirmText="Delete Permanently"
        destructive={true}
        onConfirm={() => handleAdminDeletePost(post.id)}
      />

      <ConfirmActionDialog
        open={isBlockDialogOpen}
        onOpenChange={setIsBlockDialogOpen}
        title={`Block ${post.authorName}?`}
        description="Are you sure you want to block this user? You will no longer see their posts or messages."
        confirmText="Block"
        destructive={true}
        onConfirm={async () => {
          try {
            const { blockUser } = await import('@/lib/actions/bond-actions');
            await blockUser(post.authorId, 'Blocked from post context menu');
            window.location.reload();
          } catch (err) {
            console.error('Block failed:', err);
          }
        }}
      />

      <EditSlugDialog
        open={isEditSlugDialogOpen}
        onOpenChange={setIsEditSlugDialogOpen}
        post={post}
        tribeSlug={state.tribe?.slug}
        onSuccess={(newSlug, slugEditedBy) => {
          post.slug = newSlug;
          if (slugEditedBy !== undefined) {
            post.slugEditedBy = slugEditedBy;
          }
          router.refresh();
        }}
      />
    </Card>
  );
};
