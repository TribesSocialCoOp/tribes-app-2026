/**
 * Creates a URL-safe slug from a string.
 * Used to build SEO-friendly post URLs like /post/{id}/{slug}.
 * Returns empty string if input is null/undefined or produces no URL-safe characters.
 */
export function slugify(text: string | undefined | null, maxLength = 60): string {
  if (!text) return '';

  const result = text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')    // Remove non-word chars (except spaces and hyphens)
    .replace(/\s+/g, '-')        // Replace spaces with hyphens
    .replace(/-+/g, '-')         // Collapse multiple hyphens
    .replace(/^-+|-+$/g, '')     // Trim leading/trailing hyphens
    .substring(0, maxLength);

  // If the slug ended up empty (e.g., all-emoji content), return empty
  return result;
}

/**
 * Sanitizes a slug segment for safe URL inclusion.
 * Strips anything that isn't alphanumeric, hyphens, or underscores.
 */
function sanitizeSlugSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 80);
}

/**
 * Builds the canonical path for a post.
 * Format: 
 * - /t/{tribeSlug}/post/{postId}/{slug} (if in a tribe)
 * - /post/{postId}/{slug} (standalone)
 */
export function buildPostPath(postId: string, slug?: string | null, tribeSlug?: string | null): string {
  const safeSlug = slug ? sanitizeSlugSegment(slug) : null;
  const safeTribeSlug = tribeSlug ? sanitizeSlugSegment(tribeSlug) : null;
  const base = safeTribeSlug ? `/t/${safeTribeSlug}/post/${postId}` : `/post/${postId}`;
  return safeSlug ? `${base}/${safeSlug}` : base;
}
