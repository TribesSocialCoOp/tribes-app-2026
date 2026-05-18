#!/usr/bin/env tsx
/**
 * @fileoverview Backfill slugs for existing posts that don't have one.
 *
 * Usage: npx tsx scripts/backfill-post-slugs.ts
 */

import { db } from '../src/db';
import { posts } from '../src/db/schema';
import { isNull, eq, and } from 'drizzle-orm';
import { generateUniquePostSlug } from '../src/lib/slugify';

async function backfillPostSlugs() {
  console.log('🔍 Finding posts without slugs...');

  const rows = await db
    .select({
      id: posts.id,
      title: posts.title,
      content: posts.content,
      tribeId: posts.tribeId,
      isEncrypted: posts.isEncrypted,
    })
    .from(posts)
    .where(
      and(
        isNull(posts.slug),
        eq(posts.isEncrypted, false)
      )
    );

  console.log(`   Found ${rows.length} non-encrypted posts needing slugs.`);

  if (rows.length === 0) {
    console.log('✅ All non-encrypted posts already have slugs. Nothing to do.');
    return;
  }

  let updated = 0;
  for (const row of rows) {
    // Generate base string from title or a snippet of content
    const baseText = row.title || row.content.substring(0, 60) || 'post';
    const uniqueSlug = await generateUniquePostSlug(baseText, row.tribeId);

    await db
      .update(posts)
      .set({ slug: uniqueSlug })
      .where(eq(posts.id, row.id));

    console.log(`   ✓ Post ${row.id} (Tribe: ${row.tribeId || 'standalone'}) → slug: ${uniqueSlug}`);
    updated++;
  }

  console.log(`\n✅ Backfilled ${updated} post slug(s).`);
}

backfillPostSlugs().catch(err => {
  console.error('❌ Backfill failed:', err);
  process.exit(1);
});
