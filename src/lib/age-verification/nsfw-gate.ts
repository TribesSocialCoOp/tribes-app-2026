import 'server-only';
import { resolveNsfwAccess, type NsfwAccess } from '@/lib/geo/age-policy';
import { getRequestRegion, regionCode, getSurface } from '@/lib/geo/resolve-region';

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

  const [region, surface] = await Promise.all([getRequestRegion(), getSurface()]);

  let hasOptIn = false;
  let hasVerified = false;
  if (opts.userId) {
    const { db } = await import('@/db');
    const { users } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const [u] = await db
      .select({ showAdultContentAt: users.showAdultContentAt, ageVerifiedAt: users.ageVerifiedAt })
      .from(users)
      .where(eq(users.id, opts.userId))
      .limit(1);
    hasOptIn = !!u?.showAdultContentAt;
    hasVerified = !!u?.ageVerifiedAt;
  }

  return resolveNsfwAccess({
    isNsfw: true,
    hasOptIn,
    hasVerified,
    regionCode: regionCode(region),
    surface,
  });
}
