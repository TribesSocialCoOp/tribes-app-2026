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
): TribePost {
  return {
    id: row.id,
    tribeId: row.tribeId ?? undefined,
    authorId: row.authorId,
    authorName: row.authorName,
    authorAvatar: row.authorAvatar ?? undefined,
    authorAvatarFallback: row.authorAvatarFallback,
    dataAiHintAvatar: row.dataAiHintAvatar ?? undefined,
    timestamp: row.createdAt ?? new Date(),
    title: row.title ?? undefined,
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
  };
}
