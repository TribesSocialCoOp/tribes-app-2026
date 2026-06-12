/**
 * prf-vault-settings-detail.spec.ts
 *
 * Full settings page sweep to find Key Vault section and capture all scroll positions.
 * Run: npx playwright test tests/prf-vault-settings-detail.spec.ts --headed
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

async function loginAs(page: any, role: string) {
  await page.goto(`${BASE}/your-comms`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const currentUrl = page.url();
  if (!currentUrl.includes('/login')) {
    console.log('[login] Already logged in:', currentUrl);
    return;
  }

  console.log('[login] On login page, clicking dev bypass...');
  await page.waitForSelector(`button:has-text("${role}")`, { state: 'visible', timeout: 10_000 });
  await page.click(`button:has-text("${role}")`);

  // Wait for navigation away from login page (client-side router.push)
  await page.waitForFunction(
    () => !window.location.pathname.startsWith('/login'),
    { timeout: 30_000, polling: 500 }
  );
  console.log('[login] Navigated to:', page.url());
  await page.waitForTimeout(2000);
}

test('Settings full sweep — find Key Vault section', async ({ page }) => {
  await page.setViewportSize(MOBILE);
  const allLogs: string[] = [];
  page.on('console', (msg: any) => {
    allLogs.push(`[${msg.type()}] ${msg.text()}`);
  });

  await loginAs(page, 'Dustin');
  await page.waitForTimeout(3000);

  // Navigate to settings
  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);

  // Full page screenshot
  const fullPath = path.join(SCREENSHOTS_DIR, 'settings-full-page.png');
  await page.screenshot({ path: fullPath, fullPage: true });
  console.log(`[screenshot] ${fullPath}`);

  // Get page dimensions
  const pageHeight = await page.evaluate(() => document.body.scrollHeight);
  console.log(`[settings] Full page height: ${pageHeight}px`);

  // Check what vault/key-sync content exists
  const fullText = await page.textContent('body');
  const terms = ['Key Vault', 'vault', 'PRF', 'passkey', 'key sync', 'Key Sync', 'encryption', 'Backup'];
  console.log('[settings] Content found:');
  terms.forEach(t => console.log(`  "${t}": ${fullText?.includes(t)}`));

  // Try to find and scroll to Key Vault section
  const keyVaultSection = page.locator('text=/key vault/i').first();
  const kvCount = await keyVaultSection.count();
  console.log(`\n[settings] "Key Vault" elements found: ${kvCount}`);

  if (kvCount > 0) {
    await keyVaultSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
    await ss(page, 'settings-key-vault-found');
  }

  // Find key management / encryption section
  const encSection = page.locator('text=/encryption|Key Management|key management/i').first();
  const encCount = await encSection.count();
  console.log(`[settings] Encryption/key management elements: ${encCount}`);
  if (encCount > 0) {
    await encSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await ss(page, 'settings-encryption-section');
  }

  // Scroll through in 600px steps and take screenshots of each viewport
  const viewportHeight = 844;
  const steps = Math.ceil(pageHeight / viewportHeight);
  console.log(`\n[settings] Taking ${steps} scroll screenshots...`);
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((scrollY: number) => window.scrollTo(0, scrollY), i * 600);
    await page.waitForTimeout(200);
    await ss(page, `settings-step-${String(i).padStart(2, '0')}`);
  }

  // Print relevant console logs
  const relevant = allLogs.filter(l =>
    l.includes('key-sync') || l.includes('vault') || l.includes('[prf]') || l.includes('error')
  );
  console.log(`\n[settings] Relevant logs (${relevant.length}):`);
  relevant.forEach(l => console.log(' ', l.substring(0, 160)));

  // Assert no crash
  const errorEl = page.locator('text=/something went wrong/i').first();
  expect(await errorEl.count(), 'Settings page should not show crash error').toBe(0);
});
