import { db } from '../src/db';
import { inviteCodes } from '../src/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Script to create specific invite codes for Apple and Google reviewers.
 * 
 * 1. APPLE-REVIEW-FREE: Grants 'free' plan (default)
 * 2. GOOGLE-REVIEW-FOUNDING: Grants 'individual_coop' plan (founding member)
 */

async function main() {
  console.log('Creating reviewer invite codes...');

  const codes = [
    {
      id: 'APPLE-REVIEW-FREE',
      grantsPlanId: 'free',
      maxUses: 10,
      description: 'Invite code for Apple App Store reviewers (Free Tier)',
    },
    {
      id: 'GOOGLE-REVIEW-FOUNDING',
      grantsPlanId: 'individual_coop',
      maxUses: 10,
      description: 'Invite code for Google/Internal reviewers (Founding Member)',
    },
  ];

  for (const code of codes) {
    try {
      // Check if exists
      const [existing] = await db.select().from(inviteCodes).where(eq(inviteCodes.id, code.id)).limit(1);
      
      if (existing) {
        console.log(`Code ${code.id} already exists. Skipping.`);
        continue;
      }

      await db.insert(inviteCodes).values({
        id: code.id,
        grantsPlanId: code.grantsPlanId,
        maxUses: code.maxUses,
        createdBy: 'system', // Use a system identifier
        createdAt: new Date(),
      });

      console.log(`Successfully created code: ${code.id} (${code.grantsPlanId})`);
    } catch (err) {
      console.error(`Failed to create code ${code.id}:`, err);
    }
  }

  process.exit(0);
}

main();
