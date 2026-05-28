/**
 * @fileoverview Mention detection & notification service.
 *
 * Parses @alias references from post/comment content, resolves them to user IDs,
 * persists mention records, and fires push notifications to mentioned users.
 */

import { db } from '@/db';
import { mentions, users, userAliases } from '@/db/schema';
import { eq, or } from 'drizzle-orm';

// ============================================================
// REGEX
// ============================================================

/** Matches @alias patterns. Supports alphanumeric, hyphens, and underscores. */
const MENTION_REGEX = /@([a-zA-Z0-9_-]{2,30})/g;

// ============================================================
// CORE
// ============================================================

/**
 * Extract @mentions from content, resolve to user IDs, persist, and notify.
 * This is fire-and-forget — errors are logged but never thrown.
 */
export async function processMentions(
  content: string,
  authorId: string,
  sourceType: 'post' | 'comment' | 'story_comment',
  sourceId: string,
): Promise<void> {
  try {
    const matches = [...content.matchAll(MENTION_REGEX)];
    if (matches.length === 0) return;

    // Deduplicate aliases
    const aliases = [...new Set(matches.map(m => m[1]!.toLowerCase()))];

    for (const alias of aliases) {
      const userId = await resolveAlias(alias);
      if (!userId || userId === authorId) continue;

      // Check mention preferences
      const { getPreferences } = await import('./notification-service');
      const prefs = await getPreferences(userId);
      if (!prefs.mentionsEnabled) continue;

      // Persist mention record
      const id = `mention-${crypto.randomUUID().substring(0, 12)}`;
      await db.insert(mentions).values({
        id,
        sourceType,
        sourceId,
        mentionedUserId: userId,
        mentionerUserId: authorId,
        createdAt: new Date(),
      });

      // Fire push notification with deep link (fire-and-forget)
      import('./realtime-dispatch').then(async ({ notifyMention }) => {
        const [author] = await db.select({ name: users.name })
          .from(users).where(eq(users.id, authorId)).limit(1);
        notifyMention(userId, author?.name ?? 'Someone', sourceType, sourceId);
      }).catch(() => {});
    }
  } catch (err) {
    console.error('[mentions] Error processing mentions:', err);
    // Never throw — mentions are non-critical
  }
}

/**
 * Resolve an alias string to a user ID.
 * Checks reserved_alias first, then user_aliases table.
 */
async function resolveAlias(alias: string): Promise<string | null> {
  // Check reserved alias (case-insensitive)
  const [byReserved] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.reservedAlias, alias))
    .limit(1);
  if (byReserved) return byReserved.id;

  // Check user_aliases table
  const [byAlias] = await db.select({ userId: userAliases.userId })
    .from(userAliases)
    .where(eq(userAliases.alias, alias))
    .limit(1);
  if (byAlias) return byAlias.userId;

  // Check by exact username match (name field)
  const [byName] = await db.select({ id: users.id })
    .from(users)
    .where(eq(users.name, alias))
    .limit(1);
  if (byName) return byName.id;

  return null;
}
