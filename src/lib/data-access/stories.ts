/**
 * @fileoverview Data access layer for "Our Story" topics.
 * Now backed by Drizzle ORM + SQLite.
 */

import { db } from '@/db';
import { stories, storyArticles, storyComments } from '@/db/schema';
import { eq } from 'drizzle-orm';
import type { DiscussionComment, StoryTopic, SourceArticle } from '@/lib/types';


function rowToStoryTopic(row: typeof stories.$inferSelect): StoryTopic {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    category: row.category as StoryTopic['category'],
    curator: row.curatorName ?? undefined,
    curatorAvatar: row.curatorAvatar ?? undefined,
    curatorAvatarFallback: row.curatorAvatarFallback ?? undefined,
    dataAiHintCuratorAvatar: row.dataAiHintCuratorAvatar ?? undefined,
    coverImage: row.coverImage ?? undefined,
    dataAiHintCover: row.dataAiHintCover ?? undefined,
    discussionCount: row.discussionCount ?? 0,
    lastUpdatedAt: row.lastUpdatedAt ?? new Date(),
  };
}

function rowToArticle(row: typeof storyArticles.$inferSelect): SourceArticle {
  return {
    id: row.id,
    title: row.title,
    url: row.url,
    sourceName: row.sourceName,
    publishedDate: row.publishedAt ?? new Date(),
    summarySnippet: row.summarySnippet ?? undefined,
    dataAiHint: row.dataAiHint ?? undefined,
  };
}

function rowToComment(row: typeof storyComments.$inferSelect, allComments: (typeof storyComments.$inferSelect)[]): DiscussionComment {
  const replies = allComments
    .filter(c => c.parentCommentId === row.id)
    .map(c => rowToComment(c, allComments));

  return {
    id: row.id,
    authorId: row.authorId,
    authorName: row.authorName,
    authorAvatarFallback: row.authorAvatarFallback,
    dataAiHintAvatar: row.dataAiHintAvatar ?? undefined,
    content: row.content,
    vibes: row.vibeCount ?? 0,
    timestamp: row.createdAt ?? new Date(),
    replies: replies.length > 0 ? replies : undefined,
  };
}

/**
 * Fetches all story topics.
 */
export async function getStoryTopics(): Promise<StoryTopic[]> {
  const rows = await db.select().from(stories);
  return rows.map(rowToStoryTopic);
}

/**
 * Fetches a single story topic by its ID.
 */
export async function getStoryTopicById(storyId: string): Promise<StoryTopic | null> {
  const rows = await db.select().from(stories).where(eq(stories.id, storyId));
  const row = rows[0];
  return row ? rowToStoryTopic(row) : null;
}

/**
 * Fetches the related articles for a specific story topic.
 */
export async function getArticlesForStory(storyId: string): Promise<SourceArticle[]> {
  const rows = await db.select().from(storyArticles).where(eq(storyArticles.storyId, storyId));
  return rows.map(rowToArticle);
}

/**
 * Fetches the discussion comments for a specific story topic.
 */
export async function getCommentsForStory(storyId: string): Promise<DiscussionComment[]> {
  const allRows = await db.select().from(storyComments).where(eq(storyComments.storyId, storyId));
  // Build tree: return only root comments (no parent)
  const rootComments = allRows.filter((c: typeof storyComments.$inferSelect) => !c.parentCommentId);
  return rootComments.map((c: typeof storyComments.$inferSelect) => rowToComment(c, allRows));
}
