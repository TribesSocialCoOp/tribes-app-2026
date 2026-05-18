/**
 * @fileoverview Canonical path builders for slug-based routing.
 *
 * Every client-side link SHOULD use these helpers so that navigation
 * goes directly to the slug URL.  The legacy ID-based paths are only
 * kept as a fallback — the proxy will redirect them, but each redirect
 * is a wasted round-trip that should only serve old cached/bookmarked content.
 */

/** Canonical profile path: /u/{slug} or fallback /profile/{id} */
export function profilePath(userId: string, slug?: string | null): string {
  return slug ? `/u/${slug}` : `/profile/${userId}`;
}

/** Canonical event path: /e/{slug} or fallback /events/{id} */
export function eventPath(eventId: string, slug?: string | null): string {
  return slug ? `/e/${slug}` : `/events/${eventId}`;
}

/** Canonical proposal path: /vote/{slug} or fallback /voting/{id} */
export function proposalPath(proposalId: string, slug?: string | null): string {
  return slug ? `/vote/${slug}` : `/voting/${proposalId}`;
}
