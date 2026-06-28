/**
 * Staging Seed Script
 *
 * Populates a fresh STAGING database with a small set of synthetic users,
 * tribes, memberships, and posts so the app is usable for testing. It does
 * NOT touch plans / system bot / the Trials tribe — run seed-production.ts
 * first for that idempotent bootstrap (remote_deploy.sh does both on staging).
 *
 * This script is IDEMPOTENT (onConflictDoNothing on primary keys).
 *
 * SAFETY: refuses to run unless TRIBES_ENV=staging, so it can never seed or
 * clobber a production database.
 *
 * Run with: TRIBES_ENV=staging npx tsx src/db/seed-staging.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });
import { db } from './index';
import * as schema from './schema';

// ── Safety guard ────────────────────────────────────────────
if (process.env.TRIBES_ENV !== 'staging') {
  console.error(
    '✗ Refusing to run: TRIBES_ENV is not "staging" (got: ' +
      JSON.stringify(process.env.TRIBES_ENV) +
      ').\n  This script only runs against staging databases.',
  );
  process.exit(1);
}

const now = new Date();

async function seedStaging() {
  console.log('🌱 Staging seed starting...');

  // ---- 1. Synthetic users ----
  console.log('  👤 Users...');
  const userRows = [
    {
      id: 'stg_user_ada',
      name: 'Ada (staging)',
      email: 'ada@staging.tribes.app',
      role: 'Human_Paid',
      bio: 'Synthetic staging user for manual QA.',
      slug: 'ada-staging',
      username: 'ada_staging',
      reputationScore: 120,
      reputationStatus: 'Member',
      emailVerified: true,
      createdAt: now,
    },
    {
      id: 'stg_user_grace',
      name: 'Grace (staging)',
      email: 'grace@staging.tribes.app',
      role: 'Human_Free',
      bio: 'Synthetic staging user for manual QA.',
      slug: 'grace-staging',
      username: 'grace_staging',
      reputationScore: 30,
      reputationStatus: 'Newcomer',
      emailVerified: true,
      createdAt: now,
    },
    {
      id: 'stg_user_alan',
      name: 'Alan (staging)',
      email: 'alan@staging.tribes.app',
      role: 'Human_Free',
      bio: 'Synthetic staging user for manual QA.',
      slug: 'alan-staging',
      username: 'alan_staging',
      reputationScore: 55,
      reputationStatus: 'Newcomer',
      emailVerified: true,
      createdAt: now,
    },
  ];
  for (const u of userRows) {
    await db.insert(schema.users).values(u).onConflictDoNothing({ target: schema.users.id });
  }
  console.log(`    ✓ ${userRows.length} users`);

  // ---- 2. Tribes ----
  console.log('  🏘️  Tribes...');
  const tribeRows = [
    {
      id: 'stg_tribe_lab',
      slug: 'staging-lab',
      name: 'Staging Lab',
      description: 'A public sandbox tribe for exercising staging features.',
      isPublic: true,
      cover: '/seed/tribe-trials.svg',
      joinMechanism: 'instant',
      createdBy: 'stg_user_ada',
      memberCount: 2,
      createdAt: now,
    },
    {
      id: 'stg_tribe_inner',
      slug: 'staging-inner',
      name: 'Staging Inner Circle',
      description: 'A private tribe for testing membership + request flows.',
      isPublic: false,
      isListed: true,
      joinMechanism: 'request',
      createdBy: 'stg_user_ada',
      memberCount: 1,
      createdAt: now,
    },
  ];
  for (const t of tribeRows) {
    await db.insert(schema.tribes).values(t).onConflictDoNothing({ target: schema.tribes.id });
  }
  for (const mood of ['connect', 'create']) {
    try {
      await db.insert(schema.tribeMoodTags).values({ tribeId: 'stg_tribe_lab', moodSlug: mood });
    } catch {
      /* already present */
    }
  }
  console.log(`    ✓ ${tribeRows.length} tribes`);

  // ---- 3. Memberships ----
  console.log('  🤝 Memberships...');
  const memberRows = [
    { id: 'stg_mem_ada_lab', tribeId: 'stg_tribe_lab', userId: 'stg_user_ada', role: 'founder', joinedAt: now },
    { id: 'stg_mem_grace_lab', tribeId: 'stg_tribe_lab', userId: 'stg_user_grace', role: 'member', joinedAt: now },
    { id: 'stg_mem_ada_inner', tribeId: 'stg_tribe_inner', userId: 'stg_user_ada', role: 'founder', joinedAt: now },
  ];
  for (const m of memberRows) {
    await db.insert(schema.tribeMembers).values(m).onConflictDoNothing({ target: schema.tribeMembers.id });
  }
  console.log(`    ✓ ${memberRows.length} memberships`);

  // ---- 4. Posts ----
  console.log('  📝 Posts...');
  const postRows = [
    {
      id: 'stg_post_welcome',
      slug: 'welcome-to-the-staging-lab',
      tribeId: 'stg_tribe_lab',
      authorId: 'stg_user_ada',
      authorName: 'Ada (staging)',
      authorAvatarFallback: 'AS',
      title: 'Welcome to the Staging Lab',
      content: 'This is synthetic content on the staging environment. Poke at things freely — nothing here is real.',
      isPinned: true,
      createdAt: now,
    },
    {
      id: 'stg_post_hello',
      slug: 'hello-from-grace',
      tribeId: 'stg_tribe_lab',
      authorId: 'stg_user_grace',
      authorName: 'Grace (staging)',
      authorAvatarFallback: 'GS',
      content: 'Hello! Testing the post composer on staging.',
      createdAt: now,
    },
  ];
  for (const p of postRows) {
    await db.insert(schema.posts).values(p).onConflictDoNothing({ target: schema.posts.id });
  }
  console.log(`    ✓ ${postRows.length} posts`);

  // ---- Summary ----
  console.log('\n✅ Staging seed complete!');
  const counts = {
    users: (await db.select().from(schema.users)).length,
    tribes: (await db.select().from(schema.tribes)).length,
    tribeMembers: (await db.select().from(schema.tribeMembers)).length,
    posts: (await db.select().from(schema.posts)).length,
  };
  console.log('\n📊 Staging Data:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`   ${table}: ${count} rows`);
  }
}

seedStaging().catch((err) => {
  console.error(err);
  process.exit(1);
});
