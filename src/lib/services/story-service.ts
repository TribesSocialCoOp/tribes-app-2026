/**
 * @fileoverview Story service — CRUD for "Our Story" shared news feature.
 * 
 * Stories are community-curated news topics with source articles and discussion.
 * Any user with Active reputation or higher can create a story.
 * The creator becomes the story's "curator."
 */

import { db } from '@/db';
import { stories, storyArticles, storyComments, users } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

// ============================================================
// STORY TOPIC CRUD
// ============================================================

/**
 * Creates a new story topic. The creator becomes the curator.
 */
export async function createStoryTopic(
  curatorId: string,
  data: {
    title: string;
    summary: string;
    category: 'local' | 'national' | 'global';
    coverImage?: string;
  },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();

  // Get curator info
  const [curator] = await db.select({
    name: users.name,
    avatar: users.avatar,
  }).from(users).where(eq(users.id, curatorId)).limit(1);

  const curatorName = curator?.name ?? 'Anonymous';

  await db.insert(stories).values({
    id,
    title: data.title,
    summary: data.summary,
    category: data.category,
    curatorName,
    curatorAvatar: curator?.avatar ?? null,
    curatorAvatarFallback: curatorName.substring(0, 2).toUpperCase(),
    coverImage: data.coverImage ?? null,
    discussionCount: 0,
    lastUpdatedAt: new Date(),
  });

  return { id };
}

/**
 * Adds a source article to a story.
 */
export async function addSourceArticle(
  storyId: string,
  data: {
    title: string;
    url: string;
    sourceName: string;
    summarySnippet?: string;
  },
): Promise<{ id: string }> {
  const id = crypto.randomUUID();

  await db.insert(storyArticles).values({
    id,
    storyId,
    title: data.title,
    url: data.url,
    sourceName: data.sourceName,
    publishedAt: new Date(),
    summarySnippet: data.summarySnippet ?? null,
  });

  // Update the story's lastUpdatedAt
  await db.update(stories)
    .set({ lastUpdatedAt: new Date() })
    .where(eq(stories.id, storyId));

  return { id };
}

// ============================================================
// COMMENTS
// ============================================================

export async function createStoryComment(
  storyId: string,
  authorId: string,
  content: string,
  parentCommentId?: string,
): Promise<{ id: string }> {
  const id = crypto.randomUUID();

  // Get author info
  const [author] = await db.select({ name: users.name })
    .from(users).where(eq(users.id, authorId)).limit(1);

  await db.insert(storyComments).values({
    id,
    storyId,
    parentCommentId: parentCommentId ?? null,
    authorId,
    authorName: author?.name ?? 'Anonymous',
    authorAvatarFallback: (author?.name ?? '??').substring(0, 2).toUpperCase(),
    content,
    vibeCount: 0,
    createdAt: new Date(),
  });

  // Increment discussion count
  const [story] = await db.select({ count: stories.discussionCount })
    .from(stories).where(eq(stories.id, storyId)).limit(1);
  if (story) {
    await db.update(stories)
      .set({
        discussionCount: (story.count ?? 0) + 1,
        lastUpdatedAt: new Date(),
      })
      .where(eq(stories.id, storyId));
  }

  return { id };
}

export async function getStoryComments(storyId: string) {
  return db.select().from(storyComments)
    .where(eq(storyComments.storyId, storyId))
    .orderBy(desc(storyComments.createdAt));
}
