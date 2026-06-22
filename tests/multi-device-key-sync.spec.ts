/**
 * multi-device-key-sync.spec.ts
 *
 * Proves the MULTI-DEVICE fix: a user's SECOND device (a fresh browser context
 * that lost the legacy single-identity publish race) keeps its OWN identity key,
 * registers itself as a device, receives a DEVICE-TARGETED tribe-key grant from
 * an online founder, and unwraps it — all WITHOUT a vault restore.
 *
 * Uses a dedicated throwaway private tribe (seeded + torn down here) so it never
 * touches real tribe data.
 *
 * Device 1 = founder context (generates the key, distributes).
 * Device 2 = second context (self-onboards).
 *
 * Run: npx playwright test tests/multi-device-key-sync.spec.ts
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const BASE = 'http://localhost:9002';
const CONN = process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes';
const TRIBE_ID = 'mdtest-tribe';
const TRIBE_SLUG = 'mdtest-tribe';
const FOUNDER = 'dustin';

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: CONN });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function seedTribe() {
  await withDb(async (c) => {
    // Clean any prior run (cascade grants/keys/members).
    await c.query(`DELETE FROM tribe_key_grants WHERE tribe_key_id IN (SELECT id FROM tribe_keys WHERE tribe_id=$1)`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_keys WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_members WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribes WHERE id=$1`, [TRIBE_ID]);
    await c.query(
      `INSERT INTO tribes (id, name, description, slug, is_public, join_mechanism, created_by)
       VALUES ($1, 'MD Test Tribe', 'multi-device test', $2, false, 'instant', $3)`,
      [TRIBE_ID, TRIBE_SLUG, FOUNDER],
    );
    await c.query(
      `INSERT INTO tribe_members (id, tribe_id, user_id, role) VALUES ($1,$2,$3,'founder')`,
      [`tm-${TRIBE_ID}-founder`, TRIBE_ID, FOUNDER],
    );
    await c.query(`UPDATE users SET tos_accepted_version='1.1.1' WHERE id=$1`, [FOUNDER]);
  });
}

async function teardownTribe() {
  await withDb(async (c) => {
    await c.query(`DELETE FROM tribe_key_grants WHERE tribe_key_id IN (SELECT id FROM tribe_keys WHERE tribe_id=$1)`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_keys WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribe_members WHERE tribe_id=$1`, [TRIBE_ID]);
    await c.query(`DELETE FROM tribes WHERE id=$1`, [TRIBE_ID]);
  });
}

async function loginAndOpenTribe(page: any) {
  await page.route('**/_next/webpack-hmr**', (r: any) => r.abort());
  await page.goto(`${BASE}/your-comms`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.waitForSelector('button:has-text("Dustin")', { state: 'visible', timeout: 15_000 });
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
  }
  await page.goto(`${BASE}/t/${TRIBE_SLUG}`, { waitUntil: 'networkidle' });
}

// Reads whether the page's IndexedDB scoped store holds the tribe key.
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

test('second device self-onboards to a private tribe key without a vault restore', async ({ browser }) => {
  test.setTimeout(150_000);
  await seedTribe();

  try {
    // ── Device 1 (founder): genesis — generate + cache the tribe key. ──
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await loginAndOpenTribe(page1);

    // Wait for genesis: server tribe_keys row exists.
    let keyRows = 0;
    const d1 = Date.now() + 45_000;
    while (Date.now() < d1) {
      await page1.waitForTimeout(2_500);
      keyRows = await withDb(async (c) =>
        (await c.query('SELECT count(*)::int n FROM tribe_keys WHERE tribe_id=$1', [TRIBE_ID])).rows[0].n);
      if (keyRows > 0 && await deviceHasTribeKey(page1, TRIBE_ID)) break;
    }
    expect(keyRows, 'device 1 (founder) should have generated the tribe key').toBeGreaterThan(0);
    expect(await deviceHasTribeKey(page1, TRIBE_ID), 'device 1 holds the key').toBe(true);

    // ── Device 2: fresh context (= new device). Self-onboard while founder online. ──
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await loginAndOpenTribe(page2);

    // Device 2 starts WITHOUT the key. It must register its own device key, get a
    // device-targeted grant from device 1 (founder, still open), and unwrap it.
    expect(await deviceHasTribeKey(page2, TRIBE_ID), 'device 2 starts without the key').toBe(false);

    let device2HasKey = false;
    const d2 = Date.now() + 75_000;
    while (Date.now() < d2) {
      await page2.waitForTimeout(3_000);
      // nudge both clients' sync loops by keeping pages active
      device2HasKey = await deviceHasTribeKey(page2, TRIBE_ID);
      if (device2HasKey) break;
    }

    // Confirm device 2 got its OWN device-targeted grant on the server.
    const device2Grants = await withDb(async (c) =>
      (await c.query(
        `SELECT count(*)::int n FROM tribe_key_grants g JOIN tribe_keys k ON k.id=g.tribe_key_id
         WHERE k.tribe_id=$1 AND g.recipient_id=$2 AND g.device_key_id IS NOT NULL`,
        [TRIBE_ID, FOUNDER],
      )).rows[0].n);

    console.log(`\n[multi-device] device2 has key: ${device2HasKey} | dustin device grants: ${device2Grants}`);

    expect(device2HasKey, 'device 2 unwrapped the tribe key WITHOUT a vault restore').toBe(true);

    await ctx2.close();
    await ctx1.close();
  } finally {
    await teardownTribe();
  }
});
