/**
 * chat-features-uat.spec.ts
 *
 * UAT for the "mature chat UX" features: emoji reactions, replies, read
 * receipts, animated emoji, composer emoji picker, and the new chat
 * preferences (read receipts / typing indicators).
 *
 * COVERAGE NOTES
 * ──────────────
 * Reliably automated (runs in CI):
 *   1. Settings → Chat preferences: the Read Receipts and Typing Indicators
 *      toggles round-trip through the UI → saveNotificationPreferences →
 *      the new notification_preferences columns → reload. Verified against
 *      the DB directly.
 *
 * Best-effort (encrypted chat — needs an unlocked vault):
 *   2. The bond chat composer is gated behind a derived ECDH shared secret,
 *      which requires a vault restore (PRF/passphrase) that can't be unlocked
 *      headlessly. When the composer IS reachable (a profile with a restored
 *      vault) the interactive UI smoke runs; otherwise it asserts the page
 *      shell rendered and skips the interactive checks with a clear note —
 *      matching the repo's convention for vault-gated flows (see
 *      key-sync-uat.spec.ts). The interactive flows are covered by manual UAT.
 *
 * Run: npx playwright test tests/chat-features-uat.spec.ts
 */

import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:9002';
const SCREENSHOTS_DIR = 'tests/screenshots/chat-features-uat';
const TEST_USER = 'dustin';
const TEST_USER_LABEL = 'Dustin';
const CHAT_BOND_ID = 'sb1'; // dustin → test-service-member (active, has history)

function db(sql: string): string {
  const cmd = `docker exec tribes-app-2026-postgres-dev-1 psql -U tribes -d tribes -t -A -c "${sql.replace(/"/g, '\\"')}"`;
  return execSync(cmd).toString().trim();
}

async function loginAs(page: Page, label = TEST_USER_LABEL) {
  await page.goto(`${BASE}/your-comms`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.waitForSelector(`button:has-text("${label}")`, { state: 'visible', timeout: 10_000 });
    await page.click(`button:has-text("${label}")`);
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
  }
}

async function ss(page: Page, name: string) {
  await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `${name}.png`), fullPage: true }).catch(() => {});
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  // Reset to a known clean state — no row means defaults (both prefs ON).
  db(`DELETE FROM notification_preferences WHERE user_id='${TEST_USER}';`);
});

test.afterAll(() => {
  db(`DELETE FROM notification_preferences WHERE user_id='${TEST_USER}';`);
});

// ── Test 1: Settings chat preferences (fully automated) ────────────────────────

test('Settings → Chat preferences: read receipts & typing toggles persist to DB', async ({ page }) => {
  await loginAs(page);
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle' });

  const readReceipts = page.locator('#readReceipts');
  const typing = page.locator('#typingIndicators');

  // Both new toggles exist and default to ON (server default).
  await readReceipts.scrollIntoViewIfNeeded();
  await expect(readReceipts).toBeVisible();
  await expect(typing).toBeVisible();
  await expect(readReceipts).toHaveAttribute('aria-checked', 'true');
  await expect(typing).toHaveAttribute('aria-checked', 'true');
  await ss(page, '01-prefs-default-on');

  // Turn both OFF and save.
  await readReceipts.click();
  await typing.click();
  await expect(readReceipts).toHaveAttribute('aria-checked', 'false');
  await expect(typing).toHaveAttribute('aria-checked', 'false');
  await page.click('button:has-text("Save Notification Preferences")');
  await expect(page.getByText('Saved', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  await ss(page, '02-prefs-saved-off');

  // Persisted to the new DB columns.
  expect(db(`SELECT read_receipts_enabled FROM notification_preferences WHERE user_id='${TEST_USER}';`)).toBe('f');
  expect(db(`SELECT typing_indicators_enabled FROM notification_preferences WHERE user_id='${TEST_USER}';`)).toBe('f');

  // Survives a reload (loaded back from the server).
  await page.reload({ waitUntil: 'networkidle' });
  await page.locator('#readReceipts').scrollIntoViewIfNeeded();
  await expect(page.locator('#readReceipts')).toHaveAttribute('aria-checked', 'false');
  await expect(page.locator('#typingIndicators')).toHaveAttribute('aria-checked', 'false');
  await ss(page, '03-prefs-reload-persisted');

  // Restore to ON and confirm the DB flips back.
  await page.locator('#readReceipts').click();
  await page.locator('#typingIndicators').click();
  await page.click('button:has-text("Save Notification Preferences")');
  await expect(page.getByText('Saved', { exact: false }).first()).toBeVisible({ timeout: 10_000 });
  expect(db(`SELECT read_receipts_enabled FROM notification_preferences WHERE user_id='${TEST_USER}';`)).toBe('t');
  expect(db(`SELECT typing_indicators_enabled FROM notification_preferences WHERE user_id='${TEST_USER}';`)).toBe('t');
});

// ── Test 2: Bond chat page (best-effort interactive smoke) ─────────────────────

test('Bond chat page renders; interactive chat UI smoke when vault is unlocked', async ({ page }) => {
  await loginAs(page);
  await page.goto(`${BASE}/bonds/${CHAT_BOND_ID}`, { waitUntil: 'networkidle' });
  // Allow key-sync / crypto to settle.
  await page.waitForTimeout(6000);

  // The page shell always renders (header with the peer name).
  await expect(page.getByText('TSM').first()).toBeVisible({ timeout: 15_000 });
  await ss(page, '04-chat-page');

  const composer = page.locator('input[placeholder*="Type a message"]');
  const composerReady = await composer.isVisible().catch(() => false);

  if (!composerReady) {
    const note = 'Encrypted chat composer not reachable — the bond shared secret requires a restored vault (PRF/passphrase), which cannot be unlocked headlessly. Interactive chat-UI checks are covered by manual UAT.';
    console.warn(`[chat-uat] ${note}`);
    test.info().annotations.push({ type: 'manual-coverage', description: note });
    // Assert we landed in the expected "awaiting key exchange" state, not an error.
    await expect(page.getByText(/Awaiting key exchange|Encrypted chat will be available/).first()).toBeVisible();
    return;
  }

  // ── Interactive smoke (runs when a vault happens to be unlocked) ──
  // Composer emoji picker opens.
  await page.click('button[title="Insert emoji"]');
  await expect(page.locator('[class*="epr-"], .EmojiPickerReact').first()).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');

  // ::shortcode:: autocomplete surfaces suggestions.
  await composer.click();
  await composer.fill('::fire');
  await expect(page.locator('text=:fire:').first()).toBeVisible({ timeout: 5000 });
  await composer.fill('');

  // Animated/large emoji: an emoji-only message renders large (text-3xl..5xl) with no bubble.
  await composer.fill('🎉');
  await page.keyboard.press('Enter');
  await expect(page.locator('p[class*="text-5xl"], p[class*="text-4xl"], p[class*="text-3xl"]').filter({ hasText: '🎉' }).first())
    .toBeVisible({ timeout: 8000 });
  await ss(page, '05-chat-interactive');
});
