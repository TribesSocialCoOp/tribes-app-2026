/**
 * @fileoverview URL-safe slug generation for tribes.
 *
 * Slugs are immutable once members join — renaming a solo tribe creates
 * a temporary redirect from the old slug (90-day TTL).
 * Collisions are resolved with a numeric suffix (e.g. "moore-family-2").
 */

import { db } from '@/db';
import { tribes, tribeSlugRedirects, posts, postSlugRedirects } from '@/db/schema';
import { eq, gt, and, isNull } from 'drizzle-orm';

/**
 * Slugs that collide with sub-routes under /t/[slug]/ or system paths.
 * If a tribe name slugifies to one of these, generateUniqueSlug will
 * append a numeric suffix (e.g. "settings-2").
 */
const RESERVED_SLUGS = new Set([
  'settings',
  'analytics',
  'manage-members',
  'mod-queue',
  'post',
  'admin',
  'api',
  'invite',
  'login',
  'signup',
  'new',
]);

/** How long old slug redirects remain active before the slug is released. */
const REDIRECT_TTL_DAYS = 90;

/**
 * Convert a human string to a URL-safe slug.
 *
 * "Moore Family"     → "moore-family"
 * "AI Innovators"    → "ai-innovators"
 * "Trïbe (Official!)" → "tribe-official"
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')                    // Decompose accents
    .replace(/[\u0300-\u036f]/g, '')     // Strip diacritics
    .replace(/[^a-z0-9]+/g, '-')        // Non-alphanumeric → hyphens
    .replace(/^-+|-+$/g, '')            // Trim leading/trailing hyphens
    .slice(0, 60);                       // Max length
}

/**
 * Generate a unique slug for a tribe name.
 * Rejects reserved slugs, active redirect slugs, and existing tribe slugs.
 */
export async function generateUniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || 'tribe';
  let candidate = base;
  let suffix = 2;

  while (true) {
    // Reject reserved slugs that collide with app routes
    if (RESERVED_SLUGS.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix++;
      continue;
    }

    // Check if slug is already taken by a tribe
    const existingTribe = await db
      .select({ id: tribes.id })
      .from(tribes)
      .where(eq(tribes.slug, candidate))
      .limit(1);

    if (existingTribe.length > 0) {
      candidate = `${base}-${suffix}`;
      suffix++;
      continue;
    }

    // Check if slug is actively being redirected (don't steal it during TTL)
    const activeRedirect = await db
      .select({ id: tribeSlugRedirects.id })
      .from(tribeSlugRedirects)
      .where(and(
        eq(tribeSlugRedirects.oldSlug, candidate),
        gt(tribeSlugRedirects.expiresAt, new Date()),
      ))
      .limit(1);

    if (activeRedirect.length > 0) {
      candidate = `${base}-${suffix}`;
      suffix++;
      continue;
    }

    return candidate;
  }
}

/**
 * Creates a temporary redirect from an old slug to a tribe.
 * Expires after REDIRECT_TTL_DAYS days.
 * If the old slug already has a redirect, it is updated (upsert).
 */
export async function createSlugRedirect(oldSlug: string, tribeId: string): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + REDIRECT_TTL_DAYS);

  // Upsert: if this slug already has a redirect, update it
  const existing = await db.select({ id: tribeSlugRedirects.id })
    .from(tribeSlugRedirects)
    .where(eq(tribeSlugRedirects.oldSlug, oldSlug))
    .limit(1);

  if (existing.length > 0) {
    await db.update(tribeSlugRedirects)
      .set({ tribeId, expiresAt })
      .where(eq(tribeSlugRedirects.oldSlug, oldSlug));
  } else {
    await db.insert(tribeSlugRedirects).values({
      id: `sr-${Date.now()}`,
      oldSlug,
      tribeId,
      expiresAt,
    });
  }
}

/**
 * Looks up an old slug redirect. Returns the current tribe slug
 * if a valid (non-expired) redirect exists, or null.
 * Expired redirects are lazily cleaned up on access.
 */
export async function resolveSlugRedirect(oldSlug: string): Promise<string | null> {
  const [redirect] = await db.select({
    tribeId: tribeSlugRedirects.tribeId,
    expiresAt: tribeSlugRedirects.expiresAt,
  })
    .from(tribeSlugRedirects)
    .where(eq(tribeSlugRedirects.oldSlug, oldSlug))
    .limit(1);

  if (!redirect) return null;

  // Expired — clean up and release the slug
  if (redirect.expiresAt < new Date()) {
    await db.delete(tribeSlugRedirects)
      .where(eq(tribeSlugRedirects.oldSlug, oldSlug));
    return null;
  }

  // Look up the current slug for the tribe
  const [tribe] = await db.select({ slug: tribes.slug })
    .from(tribes)
    .where(eq(tribes.id, redirect.tribeId))
    .limit(1);

  return tribe?.slug || null;
}

/**
 * Generate a unique slug for a post, unique within the scope of a tribe (or standalone).
 */
export async function generateUniquePostSlug(text: string, tribeId: string | null): Promise<string> {
  const base = slugify(text) || 'post';
  let candidate = base;
  let suffix = 2;

  while (true) {
    // Reject reserved slugs that collide with static paths
    if (RESERVED_SLUGS.has(candidate)) {
      candidate = `${base}-${suffix}`;
      suffix++;
      continue;
    }

    // Check if slug is already taken by a post in this tribe scope
    const existingPostQuery = db
      .select({ id: posts.id })
      .from(posts)
      .where(
        and(
          eq(posts.slug, candidate),
          tribeId ? eq(posts.tribeId, tribeId) : isNull(posts.tribeId)
        )
      )
      .limit(1);

    const existingPost = await existingPostQuery;

    if (existingPost.length > 0) {
      candidate = `${base}-${suffix}`;
      suffix++;
      continue;
    }

    // Check if slug is actively redirected in this tribe scope
    const activeRedirectQuery = db
      .select({ id: postSlugRedirects.id })
      .from(postSlugRedirects)
      .where(
        and(
          eq(postSlugRedirects.oldSlug, candidate),
          tribeId ? eq(postSlugRedirects.tribeId, tribeId) : isNull(postSlugRedirects.tribeId)
        )
      )
      .limit(1);

    const activeRedirect = await activeRedirectQuery;

    if (activeRedirect.length > 0) {
      candidate = `${base}-${suffix}`;
      suffix++;
      continue;
    }

    return candidate;
  }
}

/**
 * Creates a permanent redirect from an old post slug to the current post.
 */
export async function createPostSlugRedirect(oldSlug: string, postId: string, tribeId: string | null): Promise<void> {
  // Upsert: if this slug already has a redirect, update it
  const existing = await db.select({ id: postSlugRedirects.id })
    .from(postSlugRedirects)
    .where(
      and(
        eq(postSlugRedirects.oldSlug, oldSlug),
        tribeId ? eq(postSlugRedirects.tribeId, tribeId) : isNull(postSlugRedirects.tribeId)
      )
    )
    .limit(1);

  if (existing.length > 0) {
    await db.update(postSlugRedirects)
      .set({ postId })
      .where(eq(postSlugRedirects.id, existing[0].id));
  } else {
    await db.insert(postSlugRedirects).values({
      id: `psr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      oldSlug,
      postId,
      tribeId,
    });
  }
}

/**
 * Looks up an old post slug redirect. Returns the current post slug if a valid redirect exists, or null.
 */
export async function resolvePostSlugRedirect(oldSlug: string, tribeId: string | null): Promise<string | null> {
  const [redirect] = await db.select({
    postId: postSlugRedirects.postId,
  })
    .from(postSlugRedirects)
    .where(
      and(
        eq(postSlugRedirects.oldSlug, oldSlug),
        tribeId ? eq(postSlugRedirects.tribeId, tribeId) : isNull(postSlugRedirects.tribeId)
      )
    )
    .limit(1);

  if (!redirect) return null;

  // Look up the current slug for the post
  const [post] = await db.select({ slug: posts.slug })
    .from(posts)
    .where(eq(posts.id, redirect.postId))
    .limit(1);

  return post?.slug || null;
}

