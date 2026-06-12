/**
 * prf-vault-uat.spec.ts
 *
 * UAT for Gap 2: PRF vault auto-save feature.
 *
 * Tests:
 *  1. Login page renders with passkey button
 *  2. Dev bypass login works (Dustin Founder)
 *  3. Observe console for [key-sync] vault logs
 *  4. Look for "Key Sync Enabled" or "Security Synced" toasts
 *  5. Settings page — look for vault/key-sync status
 *  6. /bonds page renders without error
 *
 * Run: npx playwright test tests/prf-vault-uat.spec.ts --headed
 */

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = 'tests/screenshots/prf-vault-uat';
const BASE = 'http://localhost:9002';
const MOBILE = { width: 390, height: 844 };

test.beforeAll(() => {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
});

async function ss(page: any, name: string) {
  const p = path.join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log(`[screenshot] ${p}`);
  return p;
}

// Collect all console logs for later inspection
function watchAllLogs(page: any): Array<{ type: string; text: string; ts: number }> {
  const logs: Array<{ type: string; text: string; ts: number }> = [];
  page.on('console', (msg: any) => {
    logs.push({ type: msg.type(), text: msg.text(), ts: Date.now() });
  });
  return logs;
}

// ── Test 1: Login page ────────────────────────────────────────────────────────

test('1. Login page renders with passkey button and dev bypass buttons', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await ss(page, '01-login-page');

  // Check for the passkey/sign-in button
  const passkeyBtn = page.locator('button').filter({ hasText: /sign in with passkey/i }).first();
  const passkeyCount = await passkeyBtn.count();
  console.log(`[test-1] Passkey button visible: ${passkeyCount > 0}`);

  // Check for dev bypass buttons
  const devBypassDustin = page.locator('button').filter({ hasText: /Dustin/i }).first();
  const devBypassMember = page.locator('button').filter({ hasText: /Test Member/i }).first();
  const dustinCount = await devBypassDustin.count();
  const memberCount = await devBypassMember.count();
  console.log(`[test-1] Dev bypass "Dustin" button: ${dustinCount > 0}`);
  console.log(`[test-1] Dev bypass "Test Member" button: ${memberCount > 0}`);

  await ss(page, '01b-login-page-bottom');

  // At least one of these should be present
  expect(passkeyCount + dustinCount + memberCount, 'Should have passkey btn or dev bypass btns').toBeGreaterThan(0);
});

// ── Test 2: PRF environment check (attempt passkey) ──────────────────────────

test('2. Check PRF availability — attempt passkey login, observe WebAuthn behavior', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const logs = watchAllLogs(page);

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  // Check if WebAuthn / PRF is available in this browser
  const webAuthnAvailable = await page.evaluate(() => {
    return typeof window.PublicKeyCredential !== 'undefined';
  });
  console.log(`[test-2] WebAuthn available: ${webAuthnAvailable}`);

  // Check PRF extension support
  const prfAvailable = await page.evaluate(async () => {
    if (typeof window.PublicKeyCredential === 'undefined') return 'WebAuthn not supported';
    // PRF is checked by looking at the PublicKeyCredential API
    const hasConditionalCreate = typeof (window.PublicKeyCredential as any).isConditionalMediationAvailable === 'function';
    const conditionalAvail = hasConditionalCreate
      ? await (window.PublicKeyCredential as any).isConditionalMediationAvailable()
      : false;
    return {
      webAuthn: true,
      conditionalMediation: conditionalAvail,
      note: 'PRF extension availability is determined at credential creation/assertion time'
    };
  });
  console.log(`[test-2] PRF/WebAuthn status:`, JSON.stringify(prfAvailable));

  // Try clicking the passkey button if it exists
  const passkeyBtn = page.locator('button').filter({ hasText: /sign in with passkey/i }).first();
  if (await passkeyBtn.count() > 0) {
    console.log('[test-2] Clicking Sign in with Passkey button...');
    // Don't actually click it in headless mode — it would open a native dialog that can't be automated
    // Just note its presence
    console.log('[test-2] Passkey button is present but not clicked (native dialog cannot be automated)');
  }

  await ss(page, '02-webauthn-check');
});

// ── Test 3: Login via dev bypass → observe vault logs ────────────────────────

test('3. Dev bypass login as Dustin → observe key-sync vault logs', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const allLogs = watchAllLogs(page);

  await page.goto(`${BASE}/your-comms`, { waitUntil: 'networkidle' });

  if (new URL(page.url()).pathname.startsWith('/login')) {
    console.log('[test-3] Redirected to login — using dev bypass');
    await page.waitForSelector('button:has-text("Dustin")', { state: 'visible', timeout: 10_000 });
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
  }

  console.log('[test-3] Logged in. Waiting for key-sync to run (up to 15s)...');
  await page.waitForTimeout(8000);

  await ss(page, '03-after-login-your-comms');

  // Filter key-sync logs
  const keySyncLogs = allLogs.filter(l => l.text.includes('[key-sync]'));
  console.log(`[test-3] Total key-sync logs: ${keySyncLogs.length}`);
  keySyncLogs.forEach(l => console.log(`  [${l.type}] ${l.text.substring(0, 150)}`));

  // Filter vault-related logs
  const vaultLogs = allLogs.filter(l =>
    l.text.toLowerCase().includes('vault') ||
    l.text.includes('[prf]') ||
    l.text.includes('[vault]') ||
    l.text.includes('wrappingKey') ||
    l.text.includes('sessionVaultKey') ||
    l.text.includes('maybeSaveVault')
  );
  console.log(`[test-3] Vault-related logs: ${vaultLogs.length}`);
  vaultLogs.forEach(l => console.log(`  [${l.type}] ${l.text.substring(0, 150)}`));

  // Look for toast notifications
  const toastLocator = page.locator('[data-sonner-toast], [role="status"], .toast, [data-testid*="toast"]');
  const toastCount = await toastLocator.count();
  console.log(`[test-3] Toast elements found: ${toastCount}`);
  if (toastCount > 0) {
    for (let i = 0; i < toastCount; i++) {
      const text = await toastLocator.nth(i).textContent();
      console.log(`  Toast ${i}: "${text}"`);
    }
  }

  await ss(page, '03b-toasts-check');

  expect(keySyncLogs.length, 'Should have at least some key-sync logs after login').toBeGreaterThan(0);
});

// ── Test 4: Look for "Key Sync Enabled" toast specifically ───────────────────

test('4. Check for Key Sync Enabled or Security Synced toast on login', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const allLogs = watchAllLogs(page);
  const toastsObserved: string[] = [];

  // Intercept toasts by watching DOM mutations
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  // Set up a mutation observer to catch toasts
  await page.evaluate(() => {
    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        for (const node of Array.from(m.addedNodes)) {
          if (node instanceof Element) {
            const text = node.textContent || '';
            if (text.includes('Sync') || text.includes('vault') || text.includes('Security')) {
              console.log(`[DOM-toast] ${text.substring(0, 200)}`);
            }
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    (window as any).__toastObserver = observer;
  });

  if (new URL(page.url()).pathname.startsWith('/login')) {
    const dustinBtn = page.locator('button').filter({ hasText: /Dustin/i }).first();
    if (await dustinBtn.count() > 0) {
      console.log('[test-4] Clicking Dustin dev bypass...');
      await dustinBtn.click();
      await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
    }
  }

  // Wait for key-sync and any toasts
  console.log('[test-4] Waiting 10s for key-sync and toasts...');
  await page.waitForTimeout(10000);
  await ss(page, '04-after-login-toast-watch');

  // Check logs for toast-related messages
  const toastLogs = allLogs.filter(l =>
    l.text.includes('Key Sync Enabled') ||
    l.text.includes('Security Synced') ||
    l.text.includes('[DOM-toast]') ||
    l.text.toLowerCase().includes('vault') ||
    l.text.includes('[prf]')
  );
  console.log(`[test-4] Toast/vault logs found: ${toastLogs.length}`);
  toastLogs.forEach(l => console.log(`  ${l.text.substring(0, 150)}`));

  // Take screenshot of current state
  await ss(page, '04b-state-after-wait');

  // This test is observational — pass regardless, just collect data
  console.log('[test-4] Note: PRF vault toasts only appear when a hardware passkey with PRF is used — not available in headless browser');
});

// ── Test 5: Settings page — vault/key-sync status ────────────────────────────

test('5. Settings page — vault and key-sync status sections', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const allLogs = watchAllLogs(page);

  // Ensure logged in
  await page.goto(`${BASE}/your-comms`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.waitForSelector('button:has-text("Dustin")', { state: 'visible', timeout: 10_000 });
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
  }

  await page.waitForTimeout(3000);

  // Navigate to settings
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  await ss(page, '05-settings-page');

  // Scroll down to find key/vault related sections
  await page.evaluate(() => window.scrollTo(0, 300));
  await page.waitForTimeout(500);
  await ss(page, '05b-settings-scrolled');

  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(500);
  await ss(page, '05c-settings-scrolled-more');

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await ss(page, '05d-settings-bottom');

  // Look for key-sync/vault related text
  const pageContent = await page.textContent('body');
  const vaultMentions = [
    'vault', 'Vault', 'key sync', 'Key Sync', 'key-sync', 'PRF', 'passkey',
    'Security Synced', 'encryption', 'Encryption', 'backup', 'Backup'
  ].filter(term => pageContent?.includes(term));
  console.log(`[test-5] Settings page mentions: ${vaultMentions.join(', ')}`);

  // Check for key-sync logs during settings page
  const keySyncLogs = allLogs.filter(l => l.text.includes('[key-sync]') || l.text.toLowerCase().includes('vault'));
  console.log(`[test-5] Key-sync/vault logs on settings page: ${keySyncLogs.length}`);
  keySyncLogs.slice(-10).forEach(l => console.log(`  ${l.text.substring(0, 150)}`));

  // Settings should render without error
  const errorEl = page.locator('text=/something went wrong/i').first();
  expect(await errorEl.count(), 'Settings page should not show error').toBe(0);
});

// ── Test 6: Bonds page ────────────────────────────────────────────────────────

test('6. Bonds page renders and check for key-sync status', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const allLogs = watchAllLogs(page);

  // Ensure logged in
  await page.goto(`${BASE}/your-comms`, { waitUntil: 'networkidle' });
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.waitForSelector('button:has-text("Dustin")', { state: 'visible', timeout: 10_000 });
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
    await page.waitForTimeout(5000); // Let key-sync run
  }

  await page.goto(`${BASE}/bonds`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await ss(page, '06-bonds-page');

  // Look for any key-sync status indicators
  const pageContent = await page.textContent('body');
  const keySyncTerms = ['key sync', 'Key Sync', 'vault', 'encrypted', 'Encrypted'].filter(
    t => pageContent?.includes(t)
  );
  console.log(`[test-6] Key/vault terms on bonds page: ${keySyncTerms.join(', ')}`);

  // Print all key-sync and vault logs
  const keySyncLogs = allLogs.filter(l =>
    l.text.includes('[key-sync]') ||
    l.text.toLowerCase().includes('vault') ||
    l.text.includes('[prf]')
  );
  console.log(`[test-6] Key-sync/vault logs during test: ${keySyncLogs.length}`);
  keySyncLogs.forEach(l => console.log(`  ${l.text.substring(0, 150)}`));

  // Check no JS errors
  const errors = allLogs.filter(l => l.type === 'error');
  if (errors.length) {
    console.log(`[test-6] JS errors: ${errors.length}`);
    errors.forEach(l => console.log(`  ERROR: ${l.text.substring(0, 150)}`));
  }

  // Page should render without crashing
  const mainContent = page.locator('main, [role="main"]').first();
  await expect(mainContent).toBeVisible({ timeout: 5000 });
  await ss(page, '06b-bonds-loaded');
});
