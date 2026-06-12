/**
 * One-off backfill: assign a unique slug to every user that has none.
 *
 * Seed users were created without slugs/usernames, so profilePath() falls back
 * to /profile/{id}, which the gatekeeper bounces to the feed. This derives a
 * slug from each user's name using the SAME slugify/uniqueness logic as real
 * signups (passkey + password), so backfilled slugs are indistinguishable.
 *
 * Idempotent: only touches rows where slug IS NULL or ''. Safe to re-run.
 *
 * Usage: npx tsx --env-file=.env.local scripts/backfill-user-slugs.ts
 */
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq, isNull, or } from 'drizzle-orm';
import { generateUniqueSlug } from '@/lib/utils/slugify';

async function main() {
  const needSlug = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(or(isNull(users.slug), eq(users.slug, '')));

  if (needSlug.length === 0) {
    console.log('[backfill] All users already have slugs. Nothing to do.');
    return;
  }

  console.log(`[backfill] ${needSlug.length} user(s) missing a slug. Assigning...`);

  let updated = 0;
  for (const u of needSlug) {
    // Uniqueness check hits the live table, so slugs assigned earlier in this
    // same loop are already visible and won't collide.
    const slug = await generateUniqueSlug(u.name || u.id, async (candidate) => {
      const [hit] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.slug, candidate))
        .limit(1);
      return !!hit;
    });

    await db.update(users).set({ slug }).where(eq(users.id, u.id));
    updated++;
    console.log(`  ${u.id.padEnd(20)} → ${slug}`);
  }

  console.log(`[backfill] Done. ${updated} slug(s) assigned.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backfill] Failed:', err);
    process.exit(1);
  });
