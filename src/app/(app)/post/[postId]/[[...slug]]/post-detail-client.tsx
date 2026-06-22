"use client";

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useOptimisticVibes } from '@/hooks/use-optimistic-vibes';
import Link from 'next/link';
import { profilePath } from '@/lib/utils/paths';
import { useRouter } from 'next/navigation';
import { useGoBack } from '@/hooks/use-go-back';
import { useScrollToPost } from '@/hooks/use-scroll-to-post';
import { useIsMobile } from '@/hooks/use-mobile';
import { VibePicker } from '@/components/ui/vibe-picker';
import { useTimeSince } from '@/hooks/use-time-since';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from '@/components/ui/button';
import {
  ResponsiveMenu,
  ResponsiveMenuContent,
  ResponsiveMenuItem,
  ResponsiveMenuSeparator,
  ResponsiveMenuTrigger,
} from "@/components/ui/responsive-menu";
import { Badge } from '@/components/ui/badge';
import {
  ArrowLeft, Users, Globe, Lock, MessageSquareText, Smile, Send,
  Megaphone, Pin, Trash2, Pencil, MoreVertical, Flag, UserRoundX,
  Link2, Loader2, Rss, Copy, Check
} from "lucide-react";
import { cn, countAllComments, insertReplyIntoTree } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { createComment, getCommentsForPost, togglePinToWall, deleteOwnPost } from '@/lib/actions/content-actions';
import type { TribePost, DiscussionComment } from '@/lib/types';
import { PostCommentCard } from './post-comment-card';
import { MarkdownContent, getReferencedImageIndices } from '@/components/ui/markdown-content';
import { ImageLightbox } from '@/components/ui/image-lightbox';
import { EncryptedImage } from '@/components/ui/encrypted-image';
import { LinkPreviewCard } from '@/components/ui/link-preview-card';
import { ConfirmActionDialog } from '@/components/ui/confirm-action-dialog';
import { CommentDialog } from '@/components/dialogs/comment-dialog';
import { EditPostDialog } from '@/components/dialogs/edit-post-dialog';
import { RoleBadge } from '@/components/ui/role-badge';
import { PinToWallDialog } from '@/components/dialogs/pin-to-wall-dialog';
import { InlineReplyBox } from '@/components/content/inline-reply-box';
import { ThreadCollapseHeader } from '@/components/content/thread-collapse-header';
import { CardFooterButton } from '@/components/content/card-footer-button';


interface PostDetailClientProps {
  post: TribePost;
  tribeName: string | null;
  tribeSlug: string | null;
  tribeId: string | null;
  isPublic: boolean;
  authorRole: 'founder' | 'speaker' | 'member';
  viewerRole: 'founder' | 'speaker' | 'member' | null;
  viewerIsMember: boolean;
}

export function PostDetailClient({
  post,
  tribeName,
  tribeSlug,
  tribeId,
  isPublic,
  authorRole,
  viewerRole,
  viewerIsMember,
}: PostDetailClientProps) {
  const { toast } = useToast();
  const { user } = useUser();
  const router = useRouter();
  const isMobile = useIsMobile();

  const goBack = useGoBack();
  const displayTime = useTimeSince(post.timestamp);


  // ── Post state ──
  const isOwnPost = !!user?.id && post.authorId === user.id;
  const isGlobalAdmin = user?.role === 'Admin';
  const isTribeSpeaker = isGlobalAdmin || (viewerRole ? ['founder', 'speaker'].includes(viewerRole) : false);
  const tribeLink = tribeSlug ? `/t/${tribeSlug}` : tribeId ? `/tribes/${tribeId}` : null;

  // ── Optimistic vibes (consolidated hook) ──
  const {
    vibeCount,
    recentVibes: currentRecentVibes,
    vibeDetails: currentVibeDetails,
    hasVibed: currentUserHasVibed,
    handleVibeSelection,
  } = useOptimisticVibes({
    targetId: post.id,
    targetType: 'post',
    serverVibeCount: post.vibes ?? 0,
    serverRecentVibes: post.recentVibes || [],
    serverVibeDetails: post.vibeDetails || [],
    serverHasVibed: post.hasVibed || false,
    serverSelectedVibe: post.selectedVibe ?? null,
    canSeeReactors: isOwnPost,
    currentUserId: user?.id,
    currentUserName: user?.name,
  });

  // ── Comments ──
  const [showComments, setShowComments] = useState(true); // show by default on post page
  const [loadedComments, setLoadedComments] = useState<DiscussionComment[]>(post.commentsData || []);
  const [isLoadingComments, setIsLoadingComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.comments ?? 0);

  // ── Reply ──
  const [showReply, setShowReply] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [replyDialogOpen, setReplyDialogOpen] = useState(false);
  const replyRef = useRef<HTMLDivElement>(null);

  // ── Pin ──
  const [isPinned, setIsPinned] = useState(post.pinnedToWall ?? false);
  const [isPinning, setIsPinning] = useState(false);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);

  // ── Delete ──
  const [isDeleted, setIsDeleted] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // ── Block ──
  const [isBlockDialogOpen, setIsBlockDialogOpen] = useState(false);

  // ── Edit ──
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // ── Lightbox ──
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // ── Copy link ──
  const [copied, setCopied] = useState(false);

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
          const { getTribeKey } = await import('@/lib/crypto/key-store');
          const cachedTribeKey = await getTribeKey(user?.id ?? '', effectiveTribeId);

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
        console.error('[PostDetailClient] Decryption failed:', err);
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

  // ── Scroll-to-comment (deep-link from notifications) ──
  useScrollToPost([loadedComments.length]);

  // ── Images ──
  const allImages = post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : []);
  const body = displayContent || '';
  const inlineRefs = body ? getReferencedImageIndices(body) : new Set<number>();
  const headerImages = allImages.filter((_, idx) => !inlineRefs.has(idx + 1));

  const loadComments = useCallback(async () => {
    setIsLoadingComments(true);
    try {
      const comments = await getCommentsForPost(post.id);
      setLoadedComments(comments);
      setCommentCount(countAllComments(comments));
    } catch { /* ignore */ } finally {
      setIsLoadingComments(false);
    }
  }, [post.id]);

  const handleCommentAdded = useCallback((newReply?: DiscussionComment) => {
    if (newReply) {
      // Optimistic insert — don't re-fetch (avoids race where the server
      // read returns stale data and overwrites the optimistic comment).
      setLoadedComments(prev => insertReplyIntoTree(prev, newReply));
      setCommentCount(prev => prev + 1);
      router.refresh(); // sync server component props (e.g. comment count badge)
    } else {
      // No reply payload → something changed (e.g. comment deleted).
      // Re-fetch the full tree so the deleted comment disappears.
      loadComments();
    }
  }, [router, loadComments]);

  const handleToggleComments = async () => {
    if (!showComments && loadedComments.length === 0) {
      await loadComments();
    }
    setShowComments(!showComments);
  };
  // ── Encrypt comment helper for private tribes ──
  const encryptCommentIfNeeded = async (text: string): Promise<{ ciphertextBase64: string; iv: string } | undefined> => {
    if (isPublic) return undefined; // Public tribe — no encryption
    const effectiveTribeId = post.tribeId || tribeId;
    if (!effectiveTribeId) return undefined; // No tribe context

    const { getTribeKey } = await import('@/lib/crypto/key-store');
    const cachedTribeKey = await getTribeKey(user?.id ?? '', effectiveTribeId);
    if (!cachedTribeKey) {
      throw new Error('Encryption keys have not synced yet. Please wait a moment and try again.');
    }

    const { encryptWithTribeKey } = await import('@/lib/crypto/tribe-encryption');
    const { toBase64 } = await import('@/lib/crypto/encoding');
    const result = await encryptWithTribeKey(text, cachedTribeKey.key);
    return {
      ciphertextBase64: toBase64(result.ciphertext),
      iv: result.iv,
    };
  };

  const handleSendReply = async () => {
    if (!replyText.trim()) return;
    setIsSendingReply(true);
    try {
      const encPayload = await encryptCommentIfNeeded(replyText.trim());
      const result = await createComment(post.id, replyText.trim(), undefined, encPayload);
      if (result && typeof result === 'object' && 'serverError' in result) {
        throw new Error(result.serverError as string);
      }
      toast({ title: 'Reply sent', description: 'Your comment has been posted.' });
      setReplyText('');
      setShowReply(false);
      setLoadedComments(prev => [...prev, result as DiscussionComment]);
      setCommentCount(prev => prev + 1);
      setShowComments(true);
      router.refresh();
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'An unexpected error occurred';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setIsSendingReply(false);
    }
  };

  if (isDeleted) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <p className="text-lg font-medium">Post deleted</p>
        <Button variant="ghost" className="mt-4" onClick={goBack}>Go Back</Button>
      </div>
    );
  }

  return (
    <div className="space-y-3 md:space-y-6 min-w-0 max-w-3xl mx-auto w-full">
      {/* Breadcrumb / Context Bar */}
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" className="gap-1.5 -ml-2" onClick={goBack}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          {tribeName && (
            <>
              <span className="text-muted-foreground/50">•</span>
              <Users className="h-3.5 w-3.5" />
              {tribeLink ? (
                <Link href={tribeLink} className="font-medium text-foreground hover:underline text-xs">
                  {tribeName}
                </Link>
              ) : (
                <span className="font-medium text-foreground text-xs">{tribeName}</span>
              )}
              {isPublic ? (
                <Badge variant="outline" className="text-[10px] gap-0.5 h-5 px-1.5">
                  <Globe className="h-2.5 w-2.5" /> Public
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] gap-0.5 h-5 px-1.5 border-emerald-500/30 text-emerald-500">
                  <Lock className="h-2.5 w-2.5" /> Private
                </Badge>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════
          POST CARD — same structure as IntercomFeedItem
          ═══════════════════════════════════════════════════════ */}
      <Card
        id={`post-${post.id}`}
        className="shadow-none sm:shadow-md hover:sm:shadow-lg transition-shadow duration-200 overflow-visible"
      >
        <CardHeader className="p-3 sm:p-4 pb-2 sm:pb-3">
          <div className="flex items-start space-x-3">
            {!post.authorIsAlias ? (
              <Link href={profilePath(post.authorId, post.authorSlug)}>
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
                className="h-10 w-10"
                fallback={post.authorAvatarFallback}
                dataAiHint={post.dataAiHintAvatar || "avatar"}
              />
            )}
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  {!post.authorIsAlias ? (
                    <Link href={profilePath(post.authorId, post.authorSlug)} className="hover:underline decoration-primary/30 underline-offset-2">
                      <CardTitle className="text-md font-semibold tracking-normal truncate">{post.authorName}</CardTitle>
                    </Link>
                  ) : (
                    <CardTitle className="text-md font-semibold tracking-normal truncate">{post.authorName}</CardTitle>
                  )}
                  <RoleBadge role={authorRole} showLabel={!isMobile} />
                </div>
                <span className="text-xs text-muted-foreground whitespace-nowrap">
                  {displayTime}
                  {post.editedAt && <span className="ml-1 opacity-70">(edited)</span>}
                </span>
              </div>
              <CardDescription className="text-xs">
                {post.pinnedToWall ? '📌 Wall update' : (post.ring ? ({
                  journal: '🪞 Journal',
                  inner_circle: '❤️ Inner Circle',
                  my_people: '🤝 My People',
                  tribes: '👥 Tribes',
                } as Record<string, string>)[post.ring] || 'Post' : 'Post')}
                {post.moodTag && ` • ${post.moodTag}`}
                {post.isEncrypted && ' 🔒'}
                {tribeName && (
                  <> • from {tribeLink ? (
                    <Link href={tribeLink} className="font-medium text-primary hover:underline">{tribeName}</Link>
                  ) : tribeName}</>
                )}
              </CardDescription>
            </div>
            {/* ── Three-dot menu ── */}
            <div className="ml-auto pl-2 text-muted-foreground flex items-center gap-1">
              <ResponsiveMenu>
                <ResponsiveMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8 touch-target-44 text-muted-foreground -mr-2">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </ResponsiveMenuTrigger>
                <ResponsiveMenuContent align="end">
                  <ResponsiveMenuItem onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    setCopied(true);
                    toast({ title: 'Link copied', description: 'Post link copied to clipboard.' });
                    setTimeout(() => setCopied(false), 2000);
                  }}>
                    {copied ? <Check className="mr-2 h-4 w-4 text-green-500" /> : <Link2 className="mr-2 h-4 w-4" />}
                    {copied ? 'Copied!' : 'Copy Link'}
                  </ResponsiveMenuItem>
                  <ResponsiveMenuSeparator />
                  {isTribeSpeaker && tribeId && (
                    <>
                      <ResponsiveMenuItem onClick={async () => {
                        try {
                          const { togglePinTribePost } = await import('@/lib/actions/content-actions');
                          const { pinned } = await togglePinTribePost(post.id);
                          toast({
                            title: pinned ? 'Post Pinned' : 'Post Unpinned',
                            description: pinned ? 'This post will stay at the top of the tribe feed.' : 'Post unpinned from top.',
                          });
                        } catch {
                          toast({ variant: 'destructive', title: 'Error', description: 'Failed to toggle pin.' });
                        }
                      }}>
                        <Pin className="mr-2 h-4 w-4" /> Pin to Tribe Top
                      </ResponsiveMenuItem>
                      <ResponsiveMenuSeparator />
                    </>
                  )}
                  {!isOwnPost && (
                    <>
                      <ResponsiveMenuItem onClick={async () => {
                        try {
                          const { reportPost } = await import('@/lib/actions/content-actions');
                          await reportPost({
                            postId: post.id,
                            postTitle: post.title,
                            reporterName: user?.name || 'Anonymous',
                            reason: 'Reported from post page',
                          });
                          toast({ title: 'Post Reported', description: 'An admin will review it.' });
                        } catch {
                          toast({ variant: 'destructive', title: 'Error', description: 'Failed to report.' });
                        }
                      }}>
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
                  {isOwnPost && (
                    <>
                      <ResponsiveMenuItem onClick={() => setEditDialogOpen(true)}>
                        <Pencil className="mr-2 h-4 w-4" /> Edit Post
                      </ResponsiveMenuItem>
                      <ResponsiveMenuItem className="text-destructive focus:text-destructive" onClick={() => setConfirmDelete(true)}>
                        <Trash2 className="mr-2 h-4 w-4" /> Delete Post
                      </ResponsiveMenuItem>
                    </>
                  )}
                </ResponsiveMenuContent>
              </ResponsiveMenu>
            </div>
          </div>
        </CardHeader>

        {/* ── Content ── */}
        <CardContent className="p-3 sm:p-4 pt-2 sm:pt-3">
          {post.title && <h3 className="text-lg font-semibold mb-1.5 text-foreground tracking-tight">{post.title}</h3>}

          {/* Multi-image grid */}
          {headerImages.length > 0 && (
            <div className={cn(
              "mb-3 grid gap-2 overflow-hidden rounded-md border bg-muted/20",
              headerImages.length === 1 ? "grid-cols-1" :
                headerImages.length === 2 ? "grid-cols-2" :
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
                      <EncryptedImage fileId={urlOrId} postId={post.id} ring={post.ring || 'tribes'} tribeId={post.tribeId || tribeId || undefined} alt={`${post.imageAlt || "Post image"} ${idx + 1}`} className={cn(
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
          )}

          {/* Decryption states */}
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
          {/* Markdown body */}
          {(!post.isEncrypted || decryptionStatus === 'success') && body && <MarkdownContent
            content={body}
            imageUrls={post.imageUrls?.length ? post.imageUrls : (post.imageUrl ? [post.imageUrl] : undefined)}
            isEncrypted={post.isEncrypted}
            postId={post.id}
            ring={post.ring || 'tribes'}
            tribeId={post.tribeId || tribeId || undefined}
            onImageClick={(idx) => { setLightboxIndex(idx); setLightboxOpen(true); }}
          />}

          {/* Link preview */}
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
        </CardContent>

        {/* ── Interactive Footer — vibes, comments, reply, pin ── */}
        <CardFooter className="p-3 sm:p-4 pt-2 sm:pt-3 flex items-center justify-start flex-wrap gap-x-2 sm:gap-x-4 gap-y-1 border-t">
          {/* Vibe picker */}
          <VibePicker
            vibeCount={vibeCount}
            recentVibes={currentRecentVibes}
            vibeDetails={currentVibeDetails}
            hasVibed={currentUserHasVibed}
            isAuthor={isOwnPost}
            onVibeSelect={handleVibeSelection}
          />

          {/* Comment toggle */}
          <CardFooterButton icon={MessageSquareText} loading={isLoadingComments} onClick={handleToggleComments}>
            {commentCount}
          </CardFooterButton>

          {/* Reply */}
          <CardFooterButton
            icon={Send}
            label="Reply"
            onClick={() => {
              if (isMobile) {
                setReplyDialogOpen(true);
              } else {
                setShowReply(!showReply);
              }
            }}
          />

          {/* Pin to Wall */}
          {isOwnPost && (
            <CardFooterButton
              icon={Pin}
              label={isPinned ? 'Pinned' : 'Pin to Wall'}
              loading={isPinning}
              disabled={isPinning}
              iconClassName={isPinned ? 'fill-amber-600' : undefined}
              className={cn("hover:text-amber-600", isPinned && "text-amber-600")}
              onClick={async () => {
                if (post.isEncrypted && !isPinned) {
                  setPinDialogOpen(true);
                  return;
                }
                setIsPinning(true);
                try {
                  const result = await togglePinToWall(post.id);
                  setIsPinned(result.pinned);
                  toast({
                    title: result.pinned ? 'Pinned to Wall' : 'Unpinned from Wall',
                    description: result.pinned
                      ? 'This post now appears on your public wall.'
                      : 'This post has been removed from your wall.',
                  });
                } catch (error) {
                  toast({
                    variant: 'destructive',
                    title: 'Error',
                    description: 'Failed to update wall status.'
                  });
                } finally {
                  setIsPinning(false);
                }
              }}
            />
          )}

          {/* Delete confirm */}
          {isOwnPost && confirmDelete && (
            <ConfirmActionDialog
              open={confirmDelete}
              onOpenChange={setConfirmDelete}
              title="Delete Post"
              description="Are you sure you want to permanently delete this post? This action cannot be undone."
              confirmText="Delete"
              destructive={true}
              onConfirm={async () => {
                setIsDeleting(true);
                try {
                  await deleteOwnPost(post.id);
                  setIsDeleted(true);
                  toast({ title: 'Post deleted', description: 'Your post has been permanently removed.' });
                } catch {
                  toast({ title: 'Error', description: 'Could not delete post.', variant: 'destructive' });
                } finally {
                  setIsDeleting(false);
                  setConfirmDelete(false);
                }
              }}
            />
          )}

          <PinToWallDialog
            open={pinDialogOpen}
            onOpenChange={setPinDialogOpen}
            postId={post.id}
            decryptedContent={post.content}
            decryptedTitle={post.title || undefined}
            onSuccess={() => setIsPinned(true)}
          />
        </CardFooter>

        {/* ── Comments section ── */}
        {commentCount > 0 && (
          <div className="px-3 sm:px-4 border-t pt-2 pb-1">
            <ThreadCollapseHeader
              count={commentCount}
              isExpanded={showComments}
              onToggle={handleToggleComments}
            />
          </div>
        )}
        {showComments && loadedComments.length > 0 && (
          <div className="px-3 sm:px-4 pb-2 space-y-1">
            {loadedComments.map(comment => (
              <PostCommentCard
                key={comment.id}
                comment={comment}
                postId={post.id}
                currentUserId={user?.id}
                postAuthorId={post.authorId}
                onCommentAdded={handleCommentAdded}
                tribeId={post.tribeId || tribeId || undefined}
                isPublic={isPublic}
              />
            ))}
          </div>
        )}
        {showComments && loadedComments.length === 0 && !isLoadingComments && (
          <div className={cn("px-3 sm:px-4 pb-3 pt-2", commentCount === 0 && "border-t")}>
            <p className="text-xs text-muted-foreground text-center py-2">No comments yet — be the first to reply!</p>
          </div>
        )}

        {/* ── Inline reply (desktop) ── */}
        {!isMobile && showReply && (
          <InlineReplyBox
            ref={replyRef}
            value={replyText}
            onChange={setReplyText}
            onSend={handleSendReply}
            isSending={isSendingReply}
          />
        )}

        {/* ── Reply dialog (mobile) ── */}
        <CommentDialog
          isOpen={replyDialogOpen}
          onOpenChange={setReplyDialogOpen}
          onConfirmComment={async (content) => {
            try {
              const encPayload = await encryptCommentIfNeeded(content.trim());
              const result = await createComment(post.id, content.trim(), undefined, encPayload);
              if (result && typeof result === 'object' && 'serverError' in result) {
                throw new Error(result.serverError as string);
              }
              toast({ title: 'Reply sent', description: 'Your comment has been posted.' });
              setLoadedComments(prev => [...prev, result as DiscussionComment]);
              setCommentCount(prev => prev + 1);
              setShowComments(true);
              router.refresh();
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : 'An unexpected error occurred';
              toast({ title: 'Error', description: message, variant: 'destructive' });
            }
          }}
          postTitle={post.title}
        />

        {/* ── Lightbox ── */}
        <ImageLightbox
          images={allImages}
          initialIndex={lightboxIndex}
          open={lightboxOpen}
          onOpenChange={setLightboxOpen}
          isEncrypted={post.isEncrypted}
          postId={post.id}
          ring={post.ring || 'tribes'}
          tribeId={tribeId || undefined}
        />

        {/* ── Block dialog ── */}
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
              await blockUser(post.authorId, 'Blocked from post page');
              window.location.reload();
            } catch (err) {
              console.error('Block failed:', err);
            }
          }}
        />
      </Card>

      {/* ── Edit Post Dialog (standalone — no intercom context needed) ── */}
      <EditPostDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        post={editDialogOpen ? post : null}
        onSuccess={() => {
          // Reload the page to reflect edits
          router.refresh();
        }}
      />
    </div>
  );
}
