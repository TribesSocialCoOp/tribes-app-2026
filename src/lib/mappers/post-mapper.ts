/**
 * @fileoverview Shared row-to-domain mapper for TribePost.
 * Single source of truth — imported by post-service and moderation-service.
 */
import type { posts } from '@/db/schema';
import type { TribePost, DiscussionComment, Ring } from '@/lib/types';

/**
 * Maps a Drizzle `posts` row to the application-level `TribePost` type.
 * Optionally attaches pre-built comment tree data.
 */
export function rowToTribePost(
  row: typeof posts.$inferSelect,
  commentsData?: DiscussionComment[],
  liveAvatar?: string | null,
  authorIsAlias?: boolean,
  liveName?: string | null,
): TribePost {
  const displayName = liveName || row.authorName;
  const displayFallback = liveName
    ? liveName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || row.authorAvatarFallback
    : row.authorAvatarFallback;
  return {
    id: row.id,
    tribeId: row.tribeId ?? undefined,
    authorId: row.authorId,
    authorName: displayName,
    authorAvatar: liveAvatar || (row.authorAvatar ?? undefined),
    authorAvatarFallback: displayFallback,
    dataAiHintAvatar: row.dataAiHintAvatar ?? undefined,
    timestamp: row.createdAt ?? new Date(),
    title: row.title ?? undefined,
    slug: row.slug ?? undefined,
    content: row.content,
    imageUrl: row.imageUrl ?? undefined,
    imageUrls: row.imageUrls ?? undefined,
    imageAlt: row.imageAlt ?? undefined,
    dataAiHintImage: row.dataAiHintImage ?? undefined,
    vibes: row.vibeCount ?? 0,
    comments: row.commentCount ?? 0,
    isRemoved: row.isRemoved ?? false,
    canBeReposted: row.canBeReposted ?? true,
    removalReason: row.removalReason ?? undefined,
    originalPostId: row.originalPostId ?? undefined,
    isPinned: row.isPinned ?? false,
    ring: (row.ring as Ring) ?? undefined,
    moodTag: row.moodTag ?? undefined,
    pinnedToWall: row.pinnedToWall ?? false,
    commentsData,
    // Encryption fields — pass to client for E2E decryption
    isEncrypted: row.isEncrypted ?? false,
    ciphertextBase64: row.ciphertext
      ? Buffer.from(row.ciphertext as Buffer).toString('base64')
      : undefined,
    encryptionIv: row.encryptionIv ?? undefined,
    // Encrypted title — decrypted client-side with the same per-post key
    titleCiphertextBase64: row.titleCiphertext
      ? Buffer.from(row.titleCiphertext as Buffer).toString('base64')
      : undefined,
    titleIv: row.titleIv ?? undefined,
    // Link preview metadata
    linkUrl: row.linkUrl ?? undefined,
    linkTitle: row.linkTitle ?? undefined,
    linkDescription: row.linkDescription ?? undefined,
    linkImage: row.linkImage ?? undefined,
    linkSiteName: row.linkSiteName ?? undefined,
    editedAt: row.editedAt ?? undefined,
    authorIsAlias: authorIsAlias ?? false,
    slugEditedBy: row.slugEditedBy ?? undefined,
  };
}
