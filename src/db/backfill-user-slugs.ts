import { db } from './index';
import { users } from './schema';
import { slugify } from '../lib/utils/slugify';
import { eq, isNull, or } from 'drizzle-orm';

async function backfillUserSlugs() {
  console.log('🔍 Fetching all users to build slug map...');
  const allUsers = await db.select({
    id: users.id,
    name: users.name,
    slug: users.slug,
  }).from(users);

  console.log(`   Found ${allUsers.length} total users in database.`);

  const toBackfill = allUsers.filter(u => !u.slug);
  console.log(`   Found ${toBackfill.length} users needing slugs.`);

  if (toBackfill.length === 0) {
    console.log('✅ All users already have slugs. Nothing to do.');
    process.exit(0);
  }

  // Build a set of all currently used/assigned slugs
  const usedSlugs = new Set<string>();
  for (const u of allUsers) {
    if (u.slug) {
      usedSlugs.add(u.slug.toLowerCase());
    }
  }

  let count = 0;
  for (const row of toBackfill) {
    const base = slugify(row.name) || 'user';
    let candidate = base;
    let suffix = 2;

    while (usedSlugs.has(candidate.toLowerCase())) {
      candidate = `${base}-${suffix}`;
      suffix++;
    }

    await db.update(users)
      .set({ slug: candidate })
      .where(eq(users.id, row.id));

    usedSlugs.add(candidate.toLowerCase());
    count++;
    console.log(`   ✓ User ${row.name} (${row.id}) → /u/${candidate}`);
  }

  console.log(`\n✅ Backfill complete! Successfully backfilled ${count} user slug(s).`);
  process.exit(0);
}

backfillUserSlugs().catch(err => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
