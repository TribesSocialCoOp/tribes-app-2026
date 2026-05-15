import { db } from './index';
import { posts } from './schema';
import { slugify } from '../lib/utils/slugify';
import { eq, isNull } from 'drizzle-orm';

async function backfill() {
  const { or } = await import('drizzle-orm');
  
  console.log('Fetching posts without valid slugs...');
  const rows = await db.select({
    id: posts.id,
    title: posts.title,
    content: posts.content,
  })
  .from(posts)
  .where(or(isNull(posts.slug), eq(posts.slug, '')));

  console.log(`Found ${rows.length} posts to backfill.`);

  let count = 0;
  for (const row of rows) {
    const slug = slugify(row.title || row.content.substring(0, 60)) || null;
    await db.update(posts)
      .set({ slug })
      .where(eq(posts.id, row.id));
    
    count++;
    if (count % 10 === 0) {
      console.log(`Updated ${count}/${rows.length} posts...`);
    }
  }

  console.log('Backfill complete!');
  process.exit(0);
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
