/**
 * nsfw-age-gate.spec.ts — E2E for the NSFW age gate (issue #32).
 *
 * Exercises the whole browser-side flow without restarting the dev server:
 *   • Settings: the WEB-ONLY adult-content opt-in + blur toggles (DB round-trip).
 *   • The 3 region tiers via the non-prod `x-tribes-geo` request header:
 *       open (no law) → opt-in suffices · verify (law state) → Google Wallet ·
 *       blocked (UK) → unavailable.
 *
 * Setup matches the repo convention: local dev login button + the db() SQL helper
 * against the dev Postgres. Seeds its own NSFW tribe (dustin is a member) so the
 * gate — not membership — is what's under test.
 *
 * Uses `domcontentloaded` (not networkidle) + element waits, so it's robust whether
 * or not the websocket relay is running. First run is slow (dev first-compile).
 *
 * Run: npx playwright test tests/nsfw-age-gate.spec.ts   (dev server must be up)
 */
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'child_process';

const BASE = 'http://localhost:9002';
const USER = 'dustin';
const USER_LABEL = 'Dustin';
const TRIBE_ID = 'tribe-e2e-nsfw';
const TRIBE_URL = `${BASE}/tribes/${TRIBE_ID}`;
const W = { timeout: 30_000 };

function db(sql: string): string {
  const cmd = `docker exec tribes-app-2026-postgres-dev-1 psql -U tribes -d tribes -t -A -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd).toString().trim();
}

/** goto with retry — dev turbopack can abort a navigation mid-compile/redirect. */
async function gotoStable(page: Page, url: string) {
  for (let i = 0; i < 3; i++) {
    try { await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 }); return; }
    catch (e) { if (i === 2) throw e; await page.waitForTimeout(1500); }
  }
}

async function loginAs(page: Page, label = USER_LABEL) {
  await gotoStable(page, `${BASE}/your-comms`);
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.click(`button:has-text("${label}")`, { timeout: 30_000 });
    await page.waitForURL('**/your-comms', { timeout: 30_000 });
    await page.waitForLoadState('domcontentloaded');         // fully settle before next nav
    await page.waitForTimeout(500);
  }
}

/** Set the dev-only region override for subsequent requests. */
async function setRegion(page: Page, code: string) {
  await page.setExtraHTTPHeaders({ 'x-tribes-geo': code });
}

const optInOn = () => db(`UPDATE users SET show_adult_content_at=now() WHERE id='${USER}';`);
const optInOff = () => db(`UPDATE users SET show_adult_content_at=NULL WHERE id='${USER}';`);
const setVerified = (v: boolean) => db(`UPDATE users SET age_verified_at=${v ? 'now()' : 'NULL'} WHERE id='${USER}';`);

// Not serial: workers:1 (config) runs these sequentially anyway, and a failure in
// one (e.g. the /settings UI test) shouldn't skip the independent gate-tier tests.

test.beforeAll(() => {
  db(`DELETE FROM tribe_members WHERE tribe_id='${TRIBE_ID}';`);
  db(`DELETE FROM tribes WHERE id='${TRIBE_ID}';`);
  db(`INSERT INTO tribes (id,slug,name,description,is_public,is_nsfw,is_listed,created_by,member_count,created_at)
      VALUES ('${TRIBE_ID}','e2e-nsfw-test','E2E NSFW Gate Test','Gate test tribe',false,true,true,'${USER}',1,now());`);
  db(`INSERT INTO tribe_members (id,tribe_id,user_id,role,joined_at)
      VALUES ('tm-${TRIBE_ID}','${TRIBE_ID}','${USER}','member',now());`);
});

test.afterAll(() => {
  db(`DELETE FROM tribe_members WHERE tribe_id='${TRIBE_ID}';`);
  db(`DELETE FROM tribes WHERE id='${TRIBE_ID}';`);
  optInOff();
  setVerified(false);
});

test('Settings: adult-content opt-in is web-settable and round-trips to the DB', async ({ page }) => {
  test.slow();
  optInOff();
  await loginAs(page);
  await gotoStable(page, `${BASE}/settings`);

  const toggle = page.locator('#adult-content-toggle');
  await expect(toggle).toBeVisible(W);
  await toggle.click();
  await expect.poll(() => db(`SELECT show_adult_content_at IS NOT NULL FROM users WHERE id='${USER}';`), W).toBe('t');

  await toggle.click();
  await expect.poll(() => db(`SELECT show_adult_content_at IS NOT NULL FROM users WHERE id='${USER}';`), W).toBe('f');

  await expect(page.locator('#blur-adult-toggle')).toBeVisible(W);
});

test('open region + NOT opted in → "enable adult content" gate', async ({ page }) => {
  test.slow();
  optInOff(); setVerified(false);
  await loginAs(page);
  await setRegion(page, 'US-CA'); // no AV law → open tier
  await gotoStable(page, TRIBE_URL);
  await expect(page.getByText('Enable adult content to view')).toBeVisible(W);
});

test('open region + opted in → content allowed (no gate)', async ({ page }) => {
  test.slow();
  optInOn(); setVerified(false);
  await loginAs(page);
  await setRegion(page, 'US-CA');
  await gotoStable(page, TRIBE_URL);
  // Positive signal: member sees the (empty) feed, not a gate card.
  await expect(page.getByText(/No Posts Yet/i)).toBeVisible(W);
  await expect(page.getByText('Enable adult content to view')).toHaveCount(0);
});

test('law state (US-KS) + opted in but unverified → Google Wallet verify gate', async ({ page }) => {
  test.slow();
  optInOn(); setVerified(false);
  await loginAs(page);
  await setRegion(page, 'US-KS'); // verify tier — opt-in is NOT enough
  await gotoStable(page, TRIBE_URL);
  await expect(page.getByText('Verify your age to continue')).toBeVisible(W);
});

test('law state (US-KS) + verified → content allowed', async ({ page }) => {
  test.slow();
  optInOn(); setVerified(true);
  await loginAs(page);
  await setRegion(page, 'US-KS');
  await gotoStable(page, TRIBE_URL);
  await expect(page.getByText(/No Posts Yet/i)).toBeVisible(W);
  await expect(page.getByText('Verify your age to continue')).toHaveCount(0);
});

test('blocked region (UK) → fully unavailable regardless of opt-in/verify', async ({ page }) => {
  test.slow();
  optInOn(); setVerified(true);
  await loginAs(page);
  await setRegion(page, 'GB');
  await gotoStable(page, TRIBE_URL);
  await expect(page.getByText('Not available in your region')).toBeVisible(W);
});
