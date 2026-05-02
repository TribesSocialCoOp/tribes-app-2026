import { db } from '@/db';
import { mediaFiles, posts, users, userAliases, tribes } from '@/db/schema';
import { lt, isNotNull, or, eq } from 'drizzle-orm';
import { deleteObject, getBucketForContext } from '@/lib/services/s3-service';
import { s3Logger } from '@/lib/logger';

const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  console.log(`🧹 Starting SeaweedFS Cleanup Job ${DRY_RUN ? '(DRY RUN)' : ''}`);
  
  // 1. Gather all active references
  const activeUrls = new Set<string>();

  // Posts
  const allPosts = await db.select({ imageUrl: posts.imageUrl, imageUrls: posts.imageUrls }).from(posts);
  for (const post of allPosts) {
    if (post.imageUrl) activeUrls.add(post.imageUrl);
    if (post.imageUrls) {
      for (const url of post.imageUrls) activeUrls.add(url);
    }
  }

  // Users (Avatars)
  const allUsers = await db.select({ avatar: users.avatar }).from(users).where(isNotNull(users.avatar));
  for (const u of allUsers) {
    if (u.avatar) activeUrls.add(u.avatar);
  }

  // Aliases (Avatars)
  const allAliases = await db.select({ avatar: userAliases.avatar }).from(userAliases).where(isNotNull(userAliases.avatar));
  for (const a of allAliases) {
    if (a.avatar) activeUrls.add(a.avatar);
  }

  // Tribes (Covers/Brands)
  const allTribes = await db.select({ cover: tribes.cover, brand: tribes.brandLogo }).from(tribes);
  for (const t of allTribes) {
    if (t.cover) activeUrls.add(t.cover);
    if (t.brand) activeUrls.add(t.brand);
  }

  console.log(`🔍 Found ${activeUrls.size} active media references in database.`);

  // 2. Find all media_files older than 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const allMedia = await db.select().from(mediaFiles).where(lt(mediaFiles.createdAt, oneDayAgo));

  console.log(`🔍 Found ${allMedia.length} media files older than 24 hours to check.`);

  let orphanedCount = 0;
  let errorCount = 0;

  for (const file of allMedia) {
    // A file is actively used if either its ID or its publicUrl is in the active set
    const isReferencedById = activeUrls.has(file.id);
    const isReferencedByUrl = file.publicUrl ? activeUrls.has(file.publicUrl) : false;
    
    // Also consider it explicitly deleted if deletedAt is set
    const isExplicitlyDeleted = file.deletedAt !== null;

    if (!isReferencedById && !isReferencedByUrl || isExplicitlyDeleted) {
      orphanedCount++;
      
      console.log(`${DRY_RUN ? '[DRY RUN] Would delete' : 'Deleting'} orphan: ${file.id} (${file.s3Key})`);
      
      if (!DRY_RUN) {
        try {
          // Delete from S3
          await deleteObject(file.s3Key, file.bucket as 'public' | 'private');
          
          // Delete from media_files table
          await db.delete(mediaFiles).where(eq(mediaFiles.id, file.id));
        } catch (err: any) {
          console.error(`❌ Failed to delete ${file.id}:`, err.message);
          errorCount++;
        }
      }
    }
  }

  console.log(`\n✅ Cleanup complete.`);
  console.log(`- Active files: ${allMedia.length - orphanedCount}`);
  console.log(`- Orphaned files: ${orphanedCount}`);
  console.log(`- Errors: ${errorCount}`);
  
  process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
