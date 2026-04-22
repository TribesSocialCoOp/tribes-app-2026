/**
 * Production Seed Script
 * 
 * ONLY inserts essential bootstrap data for a fresh production database:
 * 1. Plans (with Stripe price IDs)
 * 2. Founding invite codes
 * 3. The Trials tribe (id: 0) — the platform welcome hub
 * 4. System bot user (T-Codex Prime)
 *
 * This script is IDEMPOTENT — safe to run multiple times.
 * It will skip rows that already exist.
 *
 * Run with: npx tsx src/db/seed-production.ts
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.production' });
import { db } from './index';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

async function seedProduction() {
  console.log('🌱 Production seed starting...');

  // ---- 1. Plans ----
  console.log('  💳 Plans...');
  const planRows = [
    {
      id: 'free',
      name: 'Always Free',
      description: 'Basic access for community participation and secure communication.',
      priceMonthly: null,
      priceYearly: null,
      maxBonds: 10,
      maxTribesOwned: 0,
      targetRole: 'Human_Free',
      sortOrder: 0,
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      features: JSON.stringify(['basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption']),
    },
    {
      id: 'individual_coop',
      name: 'Individual Co-Op Member',
      description: 'For active creators and leaders who want to support and govern the community.',
      priceMonthly: 700,
      priceYearly: 7000,
      maxBonds: null,
      maxTribesOwned: 5,
      targetRole: 'Human_Paid',
      sortOrder: 1,
      stripePriceIdMonthly: 'price_1TH7EdEXBN16ztITClMg6JTF',
      stripePriceIdYearly: 'price_1TH7EmEXBN16ztITwyZqXk0v',
      features: JSON.stringify([
        'basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption',
        'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting',
        'create_tribes', 'host_events', 'early_access',
      ]),
    },
    {
      id: 'org_base',
      name: 'Organization Base',
      description: 'For small creators, vendors, and organizations ready to build.',
      priceMonthly: 2900,
      priceYearly: 29000,
      maxBonds: 500,
      maxTribesOwned: 10,
      targetRole: 'Org_Base',
      sortOrder: 2,
      stripePriceIdMonthly: 'price_1TH7F6EXBN16ztIT6PU12axd',
      stripePriceIdYearly: 'price_1TH7F6EXBN16ztIT7sAdFm3B',
      features: JSON.stringify([
        'basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption',
        'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting',
        'create_tribes', 'host_events', 'early_access',
        'org_branding', 'verified_profile', 'commerce_5pct',
      ]),
    },
    {
      id: 'org_pro',
      name: 'Organization Pro',
      description: 'For growing organizations that need more scale and insight.',
      priceMonthly: 7900,
      priceYearly: 79000,
      maxBonds: 2000,
      maxTribesOwned: 50,
      targetRole: 'Org_Pro',
      sortOrder: 3,
      stripePriceIdMonthly: 'price_1TH7FREXBN16ztIT9aW331np',
      stripePriceIdYearly: 'price_1TH7FREXBN16ztIT0maLVoYV',
      features: JSON.stringify([
        'basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption',
        'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting',
        'create_tribes', 'host_events', 'early_access',
        'org_branding', 'verified_profile', 'commerce_5pct',
        'analytics', 'priority_support',
      ]),
    },
    {
      id: 'org_enterprise',
      name: 'Enterprise',
      description: 'For large-scale operations with custom needs.',
      priceMonthly: null,
      priceYearly: null,
      maxBonds: null,
      maxTribesOwned: null,
      targetRole: 'Org_Enterprise',
      sortOrder: 4,
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      features: JSON.stringify([
        'basic_profile', 'tribe_join', 'mood_stream', 'e2e_encryption',
        'reserve_alias', 'family_bonds', 'vault_backup', 'coop_voting',
        'create_tribes', 'host_events', 'early_access',
        'org_branding', 'verified_profile', 'commerce_negotiable',
        'analytics', 'priority_support', 'sla', 'dedicated_support', 'api_access',
      ]),
    },
  ];

  for (const plan of planRows) {
    await db.insert(schema.plans)
      .values(plan)
      .onConflictDoNothing({ target: schema.plans.id })
      .run();
  }
  console.log(`    ✓ ${planRows.length} plans upserted`);

  // ---- 2. Founding Invite Codes ----
  console.log('  🎫 Founding invite codes...');
  const foundingCodes = [
    { id: 'FOUNDING-ALPHA-001', grantsPlanId: 'individual_coop', maxUses: 50, usedCount: 0 },
    { id: 'FOUNDING-BETA-001', grantsPlanId: 'individual_coop', maxUses: 100, usedCount: 0 },
  ];

  for (const code of foundingCodes) {
    await db.insert(schema.inviteCodes)
      .values(code)
      .onConflictDoNothing({ target: schema.inviteCodes.id })
      .run();
  }
  console.log(`    ✓ ${foundingCodes.length} founding invite codes upserted`);

  // ---- 3. System Bot User (T-Codex Prime) ----
  console.log('  🤖 System bot user...');
  await db.insert(schema.users)
    .values({
      id: 'system',
      name: 'T-Codex Prime',
      role: 'Bot',
      reputationStatus: 'Elder',
      reputationScore: 1000,
      bio: 'The tribes.app system intelligence. Guides, moderates, and assists.',
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.users.id })
    .run();
  console.log('    ✓ T-Codex Prime created');

  // ---- 4. The Trials Tribe (id: 0) ----
  console.log('  🏛️  The Trials tribe...');
  await db.insert(schema.tribes)
    .values({
      id: '0',
      name: 'The Trials',
      description: 'Welcome to Tribes.app! This is our community hub — introduce yourself, explore features, and find your people.',
      memberCount: 0,
      isPublic: true,
      cover: '/seed/tribe-trials.svg',
      dataAiHint: 'community welcome hub',
      homepageUrl: 'https://tribes.app/help',
      joinMechanism: 'instant',
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.tribes.id })
    .run();

  // Add mood tags for The Trials
  for (const mood of ['learn', 'connect']) {
    try {
      await db.insert(schema.tribeMoodTags)
        .values({ tribeId: '0', moodSlug: mood })
        .run();
    } catch {
      // Already exists, skip
    }
  }

  // Welcome post from T-Codex Prime
  await db.insert(schema.posts)
    .values({
      id: 'trial_post_welcome',
      tribeId: '0',
      authorId: 'system',
      authorName: 'T-Codex Prime',
      authorAvatarFallback: 'AI',
      title: 'Welcome to Tribes.app — Start Here!',
      content: `Welcome, human! 👋

You've made it to **Tribes.app** — a community-owned platform where real people connect, create, and govern together.

**Here's how to get started:**

1. **Explore** — Browse public tribes and find communities that interest you
2. **Introduce yourself** — Reply to this post and tell us who you are
3. **Join a tribe** — Click "Join" on any public tribe that catches your eye
4. **Create content** — Share your first post in a tribe you've joined

Your reputation grows naturally as you participate. The more you contribute, the more doors open.

*This is an invite-only alpha — you're among the first humans here. Help us build something worth protecting.*`,
      vibeCount: 0,
      commentCount: 0,
      isPinned: true,
      dataAiHintAvatar: 'robot mascot',
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: schema.posts.id })
    .run();

  console.log('    ✓ The Trials tribe + welcome post created');

  // ---- Summary ----
  console.log('\n✅ Production seed complete!');
  const counts = {
    plans: (await db.select().from(schema.plans)).length,
    inviteCodes: (await db.select().from(schema.inviteCodes)).length,
    users: (await db.select().from(schema.users)).length,
    tribes: (await db.select().from(schema.tribes)).length,
    posts: (await db.select().from(schema.posts)).length,
  };
  console.log('\n📊 Production Data:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`   ${table}: ${count} rows`);
  }
}

seedProduction().catch(console.error);
