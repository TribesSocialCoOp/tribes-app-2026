import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { db } from '../src/db/index';
import * as schema from '../src/db/schema';
import { eq } from 'drizzle-orm';

async function updateDb() {
  console.log('Updating plans...');
  await db.update(schema.plans).set({ maxBonds: null, maxMembers: 500 }).where(eq(schema.plans.id, 'org_base'));
  await db.update(schema.plans).set({ maxBonds: null, maxMembers: 2000 }).where(eq(schema.plans.id, 'org_pro'));
  await db.update(schema.plans).set({ maxMembers: null }).where(eq(schema.plans.id, 'free'));
  await db.update(schema.plans).set({ maxMembers: null }).where(eq(schema.plans.id, 'individual_coop'));
  await db.update(schema.plans).set({ maxMembers: null }).where(eq(schema.plans.id, 'org_enterprise'));
  console.log('Done updating plans.');
}

updateDb().catch(console.error);
