/**
 * tribe-key-distribution-repro.spec.ts
 *
 * REPRO for the silent tribe-key distribution failure (see
 * docs/plan-tribe-key-sync.md, Finding 1).
 *
 * Scenario (mirrors the live bug): Dustin is the FOUNDER of a private tribe and
 * holds the tribe key in his (isolated) browser context. Speaker Sam is a tribe
 * MEMBER with a published identity public key but NO key grant. When Dustin opens
 * the tribe, Phase C should generate the tribe key (genesis) and distribute a
 * grant to every ungranted member — including Sam. The bug: Sam never gets a grant.
 *
 * This test:
 *   1. Cleans the tribe's keys + grants (forces a clean genesis).
 *   2. Logs in as Dustin (founder) in an isolated context and opens the tribe.
 *   3. Captures EVERY console message + page error (to see which sync phase ran
 *      or threw — the early phases V/0/0.5/A are not error-isolated).
 *   4. Polls the DB for a grant to Sam.
 *
 * PASS  = Sam receives a grant (distribution works).
 * FAIL  = Sam gets no grant (bug reproduced) — the captured phase log shows why.
 *
 * Run: npx playwright test tests/tribe-key-distribution-repro.spec.ts
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const BASE = 'http://localhost:9002';
const TRIBE_SLUG = 'test-nsfw-tribe';
const FOUNDER_ID = 'dustin';
const SAM_ID = 'test-speaker-user';
const CONN = process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes';

async function withDb<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: CONN });
  await c.connect();
  try { return await fn(c); } finally { await c.end(); }
}

async function tribeId(): Promise<string> {
  return withDb(async (c) => {
    const r = await c.query('SELECT id FROM tribes WHERE slug=$1', [TRIBE_SLUG]);
    if (!r.rows[0]) throw new Error(`tribe ${TRIBE_SLUG} not found`);
    return r.rows[0].id as string;
  });
}

async function grantsForMember(tid: string, memberId: string): Promise<number> {
  return withDb(async (c) => {
    const r = await c.query(
      `SELECT count(*)::int AS n
         FROM tribe_key_grants g
         JOIN tribe_keys k ON k.id = g.tribe_key_id
        WHERE k.tribe_id = $1 AND g.recipient_id = $2`,
      [tid, memberId],
    );
    return r.rows[0].n as number;
  });
}

test('Phase C distributes a tribe-key grant to an ungranted member (Sam)', async ({ page }) => {
  test.setTimeout(120_000);

  const tid = await tribeId();

  // ── Step 0: preconditions ──────────────────────────────────────────────────
  await withDb(async (c) => {
    // Clean ToS gate + ensure Sam is an ungranted member with a published key.
    await c.query(
      `UPDATE users SET tos_accepted_version='1.1.1' WHERE id IN ($1,$2,'test-service-admin')`,
      [FOUNDER_ID, SAM_ID],
    );
    // Force a clean genesis: drop this tribe's grants + keys.
    await c.query(
      `DELETE FROM tribe_key_grants WHERE tribe_key_id IN (SELECT id FROM tribe_keys WHERE tribe_id=$1)`,
      [tid],
    );
    await c.query(`DELETE FROM tribe_keys WHERE tribe_id=$1`, [tid]);

    // Sanity: Sam is a member and has a published identity public key.
    const sam = await c.query(
      `SELECT (u.encryption_public_key IS NOT NULL) AS has_key,
              EXISTS(SELECT 1 FROM tribe_members m WHERE m.tribe_id=$1 AND m.user_id=$2) AS is_member
         FROM users u WHERE u.id=$2`,
      [tid, SAM_ID],
    );
    expect(sam.rows[0].is_member, 'Sam must be a tribe member').toBe(true);
    expect(sam.rows[0].has_key, 'Sam must have a published identity key').toBe(true);
  });

  // ── Capture all console + page errors (to see phase execution) ──────────────
  const consoleLog: string[] = [];
  const phaseLog: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (m) => {
    const t = m.text();
    consoleLog.push(`${m.type()}: ${t}`);
    if (t.includes('[key-sync]')) phaseLog.push(t);
  });
  page.on('pageerror', (e) => pageErrors.push(String(e?.message ?? e)));

  // Avoid HMR rebuild interrupts during the wait.
  await page.route('**/_next/webpack-hmr**', (r) => r.abort());

  // ── Step 1: log in as founder (isolated context) ────────────────────────────
  await page.goto(`${BASE}/your-comms`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.waitForSelector('button:has-text("Dustin")', { state: 'visible', timeout: 15_000 });
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
  }

  // ── Step 2: open the tribe → triggers key sync (genesis + distribution) ──────
  await page.goto(`${BASE}/t/${TRIBE_SLUG}`, { waitUntil: 'networkidle' });

  // ── Step 3: wait for genesis, then poll for Sam's grant ─────────────────────
  // Give the founder's client time to run several sync cycles (15s fast window).
  let founderGrants = 0;
  let samGrants = 0;
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(2_500);
    founderGrants = await grantsForMember(tid, FOUNDER_ID);
    samGrants = await grantsForMember(tid, SAM_ID);
    if (samGrants > 0) break;
  }

  // ── Diagnostics ─────────────────────────────────────────────────────────────
  const keyExists = await withDb(async (c) =>
    (await c.query('SELECT count(*)::int AS n FROM tribe_keys WHERE tribe_id=$1', [tid])).rows[0].n as number,
  );
  console.log('\n========== REPRO RESULT ==========');
  console.log(`tribe_keys rows (genesis ran?):   ${keyExists}`);
  console.log(`grants → Dustin (self-grant):     ${founderGrants}`);
  console.log(`grants → Sam (the assertion):     ${samGrants}`);
  console.log(`page errors:                      ${pageErrors.length}`);
  if (pageErrors.length) console.log('  ', pageErrors.join('\n   '));
  console.log('\n----- [key-sync] phase log -----');
  console.log(phaseLog.length ? phaseLog.join('\n') : '(no [key-sync] logs captured!)');
  console.log('==================================\n');

  // The core assertion: Sam must receive a grant.
  expect(samGrants, 'Sam should have received a tribe-key grant from the founder').toBeGreaterThan(0);
});
