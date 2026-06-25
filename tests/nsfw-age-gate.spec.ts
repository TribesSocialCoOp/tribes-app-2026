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
 * Login uses the robust prf-vault-settings-detail pattern; tribe feed pages wait for
 * networkidle; /settings (which never idles — sessions/notifications poll) uses
 * domcontentloaded + element waits. Run with the full dev server up (relay included).
 *
 * Run: npm run dev   (one terminal)
 *      npx playwright test tests/nsfw-age-gate.spec.ts   (another)
 *      npx playwright test tests/nsfw-age-gate.spec.ts -g region   (gate tiers only)
 */
import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'child_process';

const BASE = 'http://localhost:9002';
const USER = 'dustin';
const USER_LABEL = 'Dustin';
const TRIBE_ID = 'tribe-e2e-nsfw';
const TRIBE_SLUG = 'e2e-nsfw-test';
const TRIBE_URL = `${BASE}/t/${TRIBE_SLUG}`; // canonical short route (matches multi-device-key-sync)
const W = { timeout: 30_000 };

function db(sql: string): string {
  const cmd = `docker exec tribes-app-2026-postgres-dev-1 psql -U tribes -d tribes -t -A -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd).toString().trim();
}

/** Navigate + wait for the network to settle (used for tribe feed pages). */
async function gotoStable(page: Page, url: string) {
  await page.goto(url, { waitUntil: 'networkidle' });
}

// Dev quick-login — polls until we've actually left /login (the post-login redirect is
// a multi-step client router.push), then settles before the caller navigates onward.
// This is the robust pattern from prf-vault-settings-detail, which reaches /settings
// cleanly (a plain waitForURL returns mid-redirect and the next goto can detach).
async function loginAs(page: Page, label = USER_LABEL) {
  // The dev login sets the session cookie in a server action, then the client
  // router.push()es to /your-comms. There's a brief window where the cookie isn't
  // yet readable by the proxy, so that first nav can bounce back to /login. Wrap
  // the whole flow in toPass: on a bounce, the next iteration re-navigates with
  // the now-committed cookie and lands authenticated. No fixed sleep.
  await expect(async () => {
    await page.goto(`${BASE}/your-comms`, { waitUntil: 'domcontentloaded' });
    // Unauthenticated requests are 307'd to /login by the proxy.
    if (page.url().includes('/login')) {
      await page.waitForSelector(`button:has-text("${label}")`, { state: 'visible', timeout: 10_000 });
      await page.click(`button:has-text("${label}")`);
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10_000 }).catch(() => {});
    }
    expect(page.url(), 'expected to be authenticated, not on /login').not.toContain('/login');
  }).toPass({ timeout: 30_000 });
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
  optInOff();
  await loginAs(page);
  // /settings polls (sessions/notifications) so it never reaches 'networkidle' —
  // use domcontentloaded + element waits. (loginAs already settles the redirect.)
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });

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
