/**
 * Diagnostic script: Compare tribe key state between private tribes
 * Run with: npx tsx scripts/diagnose-keys.ts
 */

// Load env before anything else
import { config } from 'dotenv';
config({ path: '.env.local' });

import { db } from '../src/db';
import { tribes, tribeMembers, tribeKeys, tribeKeyGrants, users } from '../src/db/schema';
import { eq, sql } from 'drizzle-orm';

async function diagnose() {
  console.log('=== TRIBE KEY DIAGNOSTIC ===\n');

  const privateTribes = await db.select({
    id: tribes.id,
    name: tribes.name,
    isPublic: tribes.isPublic,
    createdBy: tribes.createdBy,
  }).from(tribes).where(eq(tribes.isPublic, false));

  console.log(`Found ${privateTribes.length} private tribe(s):\n`);

  for (const tribe of privateTribes) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`TRIBE: ${tribe.name}`);
    console.log(`  ID: ${tribe.id}`);
    console.log(`  Created By: ${tribe.createdBy}`);

    const members = await db.select({
      userId: tribeMembers.userId,
      role: tribeMembers.role,
    }).from(tribeMembers).where(eq(tribeMembers.tribeId, tribe.id));

    console.log(`  Members (${members.length}):`);
    for (const m of members) {
      const [user] = await db.select({
        name: users.name,
        hasKey: sql<boolean>`encryption_public_key IS NOT NULL`.as('has_key'),
      }).from(users).where(eq(users.id, m.userId)).limit(1);

      console.log(`    - ${user?.name || m.userId} (role: ${m.role || 'member'}, identity key: ${user?.hasKey ? '✅' : '❌'})`);
    }

    const keys = await db.select().from(tribeKeys).where(eq(tribeKeys.tribeId, tribe.id));
    console.log(`  Tribe Keys (${keys.length}):`);
    if (keys.length === 0) {
      console.log(`    ⚠️  NO TRIBE KEY EXISTS — key generation has never run for this tribe`);
    }
    for (const k of keys) {
      console.log(`    - ID: ${k.id}, v${k.keyVersion}, active: ${k.isActive}, created: ${k.createdAt}`);

      const grants = await db.select({
        recipientId: tribeKeyGrants.recipientId,
        grantedBy: tribeKeyGrants.grantedBy,
        grantedAt: tribeKeyGrants.grantedAt,
      }).from(tribeKeyGrants).where(eq(tribeKeyGrants.tribeKeyId, k.id));

      console.log(`    Grants (${grants.length}):`);
      for (const g of grants) {
        const [r] = await db.select({ name: users.name }).from(users).where(eq(users.id, g.recipientId)).limit(1);
        console.log(`      - ${r?.name || g.recipientId} (by: ${g.grantedBy}, at: ${g.grantedAt})`);
      }

      const grantedIds = new Set(grants.map(g => g.recipientId));
      const missing = members.filter(m => !grantedIds.has(m.userId));
      if (missing.length > 0) {
        console.log(`    ⚠️  MISSING grants for:`);
        for (const m of missing) {
          const [u] = await db.select({ name: users.name }).from(users).where(eq(users.id, m.userId)).limit(1);
          console.log(`      - ${u?.name || m.userId}`);
        }
      }
    }
    console.log('');
  }

  process.exit(0);
}

diagnose().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
