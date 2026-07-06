import 'server-only';
import { resolveNsfwAccess, type NsfwAccess } from '@/lib/geo/age-policy';
import { getRequestRegion, regionCode, getSurface } from '@/lib/geo/resolve-region';
import { PublicError } from '@/lib/actions/error-utils';

/**
 * The user's two account-level gate inputs, as booleans:
 *   hasOptIn    → users.showAdultContentAt (web-set 18+ self-attest content toggle)
 *   hasVerified → users.ageVerifiedAt (high-assurance wallet verification)
 * Guests (no userId) get both false.
 */
export async function getUserNsfwFlags(
  userId: string | null,
): Promise<{ hasOptIn: boolean; hasVerified: boolean }> {
  if (!userId) return { hasOptIn: false, hasVerified: false };
  const { db } = await import('@/db');
  const { users } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [u] = await db
    .select({ showAdultContentAt: users.showAdultContentAt, ageVerifiedAt: users.ageVerifiedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return { hasOptIn: !!u?.showAdultContentAt, hasVerified: !!u?.ageVerifiedAt };
}

/**
 * Server-side NSFW gate (issue #32): gathers the request region + surface + the
 * user's self-attest/verify flags and runs the pure policy. Used at every
 * enforcement point (view / join / create / discovery).
 */
export async function resolveNsfwGate(opts: {
  isNsfw: boolean;
  userId: string | null;
}): Promise<NsfwAccess> {
  if (!opts.isNsfw) return { decision: 'allow', reason: 'not_nsfw' };

  const [region, surface, { hasOptIn, hasVerified }] = await Promise.all([
    getRequestRegion(),
    getSurface(),
    getUserNsfwFlags(opts.userId),
  ]);

  return resolveNsfwAccess({
    isNsfw: true,
    hasOptIn,
    hasVerified,
    regionCode: regionCode(region),
    surface,
  });
}

/**
 * Run the NSFW gate for this request + user and throw the matching sentinel unless
 * the decision is 'allow'. The single enforcement helper for every throw-style gate
 * (view / join / create / settings). Sentinels are recognized client-side via
 * @/lib/age-gate; PublicError lets withPublicErrors-wrapped actions surface them
 * in production (Next.js strips plain server-action error messages).
 */
export async function assertNsfwAccess(userId: string | null): Promise<void> {
  const gate = await resolveNsfwGate({ isNsfw: true, userId });
  if (gate.decision === 'blocked') throw new PublicError('NSFW_REGION_BLOCKED');
  if (gate.decision === 'needs_verify') throw new PublicError('AGE_VERIFICATION_REQUIRED');
  if (gate.decision !== 'allow') throw new PublicError('NSFW_OPT_IN_REQUIRED');
}

/**
 * Whether listed NSFW tribes should be VISIBLE in discovery/search for this viewer.
 *
 * Looser than the view gate (`resolveNsfwGate(...).decision === 'allow'`): a listed
 * NSFW tribe exposes only metadata in discovery (name, cover, 18+ badge) — its posts
 * are gated separately at join/view. So we show it to anyone who could still gain
 * access, i.e. every non-'blocked' decision (needs_optin / needs_verify / allow);
 * attempting to join then surfaces the opt-in or wallet-verify remediation. Only
 * geo-'blocked' regions (where there's no access path at all) hide them entirely.
 */
export async function canDiscoverNsfw(userId: string | null): Promise<boolean> {
  const gate = await resolveNsfwGate({ isNsfw: true, userId });
  return gate.decision !== 'blocked';
}

/**
 * Single source of truth for the tribe DISCOVERY predicate (issue #32) — the WHERE clause
 * that decides which tribes a viewer may see in any discovery surface (search results,
 * tribe lists). Extracted so search-service and data-access can't drift apart:
 *   - discoverable = public OR explicitly listed (unlisted private tribes never surface);
 *   - NSFW tribes hidden unless this viewer+request may discover them ({@link canDiscoverNsfw});
 *     guests (no userId) stay conservative — NSFW hidden until they sign in.
 * This is metadata-only visibility; the content gate still protects the actual posts, and
 * members reach their own NSFW tribes via membership regardless of this clause.
 */
export async function discoverableTribesWhere(viewerUserId: string | null | undefined) {
  const { tribes } = await import('@/db/schema');
  const { and, or, eq } = await import('drizzle-orm');
  const showNsfw = viewerUserId ? await canDiscoverNsfw(viewerUserId) : false;
  return and(
    or(eq(tribes.isPublic, true), eq(tribes.isListed, true)),
    showNsfw ? undefined : eq(tribes.isNsfw, false),
  );
}
