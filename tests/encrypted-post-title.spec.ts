/**
 * encrypted-post-title.spec.ts
 *
 * Verifies E2E-encrypted post titles end-to-end on the TRIBE-GROUP-KEY path.
 *
 * A fresh browser context has no pre-provisioned keys, so we make the test user
 * the FOUNDER of a throwaway private tribe: on first open, key-sync genesis
 * GENERATES the tribe key locally and caches it in IndexedDB (no vault restore,
 * no second device needed — same approach as multi-device-key-sync.spec.ts).
 * The founder then composes a post WITH a title in that private tribe.
 *
 * Asserts:
 *   1. DB row is ciphertext-only — plaintext `title` and `slug` are NULL while
 *      `title_ciphertext` + `title_iv` are populated (no leak to a non-key-holder
 *      or to the URL).
 *   2. The founder (who holds the tribe key) sees the title rendered DECRYPTED in
 *      the tribe feed — exercising tribe-post-card's title decryption.
 *
 * Run: npx playwright test tests/encrypted-post-title.spec.ts
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const BASE = 'http://localhost:9002';
const CONN = process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes';
const TRIBE_ID = 'etitle-tribe';
const TRIBE_SLUG = 'etitle-tribe';
const FOUNDER = 'dustin';

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: CONN });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function seedTribe() {
  await withDb(async (c) => {
    // Clean any prior run (cascade grants/keys/members), then reseed.
    await c.query(`DELETE FROM tribe_key_grants WHERE tribe_key_id IN (SELECT id FROM tribe_keys WHERE tribe_id=$1)`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_keys WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM posts WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_members WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribes WHERE id=$1`, [TRIBE_ID]);
    await c.query(
      `INSERT INTO tribes (id, name, description, slug, is_public, is_nsfw, join_mechanism, created_by)
       VALUES ($1, 'Encrypted Title Test', 'e2e title encryption', $2, false, false, 'instant', $3)`,
      [TRIBE_ID, TRIBE_SLUG, FOUNDER],
    );
    await c.query(
      `INSERT INTO tribe_members (id, tribe_id, user_id, role) VALUES ($1,$2,$3,'founder')`,
      [`tm-${TRIBE_ID}-founder`, TRIBE_ID, FOUNDER],
    );
    // Latest ToS (v1.2.0) + opted-in so no ToS/age dialog blocks the composer.
    await c.query(
      `UPDATE users SET tos_accepted_version='1.2.0', age_verified_at=now(), show_adult_content_at=now() WHERE id=$1`,
      [FOUNDER],
    );
  });
}

async function teardownTribe() {
  await withDb(async (c) => {
    await c.query(`DELETE FROM tribe_key_grants WHERE tribe_key_id IN (SELECT id FROM tribe_keys WHERE tribe_id=$1)`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_keys WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM posts WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_members WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribes WHERE id=$1`, [TRIBE_ID]);
  });
}

// Reads whether the page's IndexedDB keystore holds the tribe key (genesis done).
async function deviceHasTribeKey(page: any, tribeId: string): Promise<boolean> {
  return page.evaluate(async (tid: string) => {
    return await new Promise<boolean>((resolve) => {
      const open = indexedDB.open('tribes_keystore');
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains('tribe_keys_v2')) { db.close(); resolve(false); return; }
        const tx = db.transaction('tribe_keys_v2', 'readonly');
        const g = tx.objectStore('tribe_keys_v2').getAll();
        g.onsuccess = () => { db.close(); resolve((g.result || []).some((e: any) => e.tribeId === tid)); };
        g.onerror = () => { db.close(); resolve(false); };
      };
      open.onerror = () => resolve(false);
    });
  }, tribeId);
}

test.afterAll(teardownTribe);

test('Encrypted post title: stored ciphertext-only, rendered decrypted for a key holder', async ({ page }) => {
  test.setTimeout(150_000);
  await seedTribe();

  // OPEN geo region so the platform age gate (dustin's feed spans an NSFW tribe)
  // resolves to "allow" and never blocks interaction.
  await page.setExtraHTTPHeaders({ 'x-tribes-geo': 'US-CA' });
  await page.route('**/_next/webpack-hmr**', (r: any) => r.abort());

  // ── Login as founder, open the tribe → genesis generates + caches the key. ──
  await page.goto(`${BASE}/your-comms`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.waitForSelector('button:has-text("Dustin")', { state: 'visible', timeout: 15_000 });
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
  }
  await page.goto(`${BASE}/t/${TRIBE_SLUG}`, { waitUntil: 'networkidle' });

  // Wait for genesis: the tribe key must be cached in this device's IndexedDB.
  let hasKey = false;
  const keyDeadline = Date.now() + 60_000;
  while (Date.now() < keyDeadline) {
    await page.waitForTimeout(2_500);
    hasKey = await deviceHasTribeKey(page, TRIBE_ID);
    if (hasKey) break;
  }
  expect(hasKey, 'founder device should hold the tribe key after genesis').toBe(true);

  const uniqueTitle = `Encrypted Title ${Date.now()}`;
  const uniqueBody = `Encrypted body ${Date.now()}`;

  // ── Compose a post WITH a title in the private tribe. ──
  await page.goto(`${BASE}/t/${TRIBE_SLUG}?compose=true`, { waitUntil: 'networkidle' });

  const addTitleBtn = page.locator('button:has-text("Add title")').first();
  await expect(addTitleBtn).toBeVisible({ timeout: 15_000 });
  await addTitleBtn.click();
  await page.locator('input[placeholder="Post title (optional)"]').first().fill(uniqueTitle);
  await page.locator('textarea').first().fill(uniqueBody);

  const postBtn = page.getByRole('button', { name: 'Post', exact: true });
  await expect(postBtn).toBeEnabled({ timeout: 10_000 });
  await postBtn.click();

  // ── Assert 1: the new row stores ciphertext only, no plaintext title/slug. ──
  let row: any = null;
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    row = await withDb(async (c) => {
      const r = await c.query(
        `SELECT id, is_encrypted, title, slug,
                (title_ciphertext IS NOT NULL) AS has_title_ct, title_iv,
                (ciphertext IS NOT NULL) AS has_body_ct
           FROM posts WHERE tribe_id=$1 ORDER BY created_at DESC LIMIT 1`,
        [TRIBE_ID],
      );
      return r.rows[0] ?? null;
    });
    if (row) break;
    await page.waitForTimeout(1_500);
  }

  expect(row, 'a new post row should exist').toBeTruthy();
  expect(row.is_encrypted, 'post must be encrypted').toBe(true);
  expect(row.title, 'plaintext title must be NULL (no leak)').toBeNull();
  expect(row.slug, 'slug must be NULL for encrypted posts (no URL leak)').toBeNull();
  expect(row.has_title_ct, 'title_ciphertext must be populated').toBe(true);
  expect(row.title_iv, 'title_iv must be populated').toBeTruthy();
  expect(row.has_body_ct, 'body ciphertext must be populated').toBe(true);

  // ── Assert 2: the founder (key holder) sees the title DECRYPTED in the feed. ──
  await page.goto(`${BASE}/t/${TRIBE_SLUG}`, { waitUntil: 'networkidle' });
  await expect(
    page.getByRole('heading', { name: uniqueTitle }),
  ).toBeVisible({ timeout: 20_000 });
});
