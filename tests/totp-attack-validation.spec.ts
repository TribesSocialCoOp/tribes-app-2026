/**
 * @fileoverview TOTP Security Attack Validation
 *
 * Playwright E2E tests that simulate real attack scenarios against the
 * TOTP 2FA login flow. These tests verify:
 *
 *   1. Password login correctly gates behind TOTP when enabled
 *   2. Rate limiting blocks brute-force TOTP attempts
 *   3. Challenge tokens are opaque — no userId is leaked to the client
 *   4. Cancel flow cleanly returns to login without session
 *
 * IMPORTANT: The in-memory rate limiter state persists across tests within
 * the same dev server process. The webServer config restarts it for each run.
 */

import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Test user fixtures
// ---------------------------------------------------------------------------

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes';
const TEST_USER_ID = 'totp-e2e-attacker';
const TEST_USERNAME = 'totp_e2e_test';
const TEST_EMAIL = 'totp_e2e_test@example.com';
const TEST_PASSWORD = 'SecureP@ss1234';
const TEST_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function setupTotpUser() {
  const hash = bcrypt.hashSync(TEST_PASSWORD, 10);
  await withDb(async (client) => {
    await client.query('DELETE FROM sessions WHERE user_id = $1', [TEST_USER_ID]);
    await client.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
    await client.query(
      `INSERT INTO users (id, name, email, username, password_hash, totp_secret, totp_enabled, role, email_verified, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, true, 'Human_Free', true, NOW())`,
      [TEST_USER_ID, 'TOTP Attack Test', TEST_EMAIL, TEST_USERNAME, hash, TEST_TOTP_SECRET]
    );
  });
}

async function teardownTotpUser() {
  await withDb(async (client) => {
    await client.query('DELETE FROM sessions WHERE user_id = $1', [TEST_USER_ID]);
    await client.query('DELETE FROM users WHERE id = $1', [TEST_USER_ID]);
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Navigate to password login and fill credentials. Avoids networkidle (HMR keeps websocket alive). */
async function loginWithPassword(page: import('@playwright/test').Page) {
  page.on('console', msg => console.log(`[PAGE CONSOLE] ${msg.type()}: ${msg.text()}`));
  page.on('pageerror', err => console.error(`[PAGE UNHANDLED ERROR] ${err.message}`));

  await page.goto('/login');
  await page.waitForSelector('text=Tribes Login', { timeout: 15000 });

  const passwordTab = page.locator('button:has-text("I use a password")');
  if (await passwordTab.isVisible({ timeout: 3000 }).catch(() => false)) {
    await passwordTab.click();
  }

  await page.locator('#email-or-username').fill(TEST_USERNAME);
  await page.locator('#password').fill(TEST_PASSWORD);
  
  // Wait for the ALTCHA widget to finish solving the PoW challenge before submitting.
  // The widget takes ~500ms-1s to fetch + solve (cost=20000). We poll for the hidden
  // input to be populated rather than using a fixed timeout.
  await page.waitForFunction(() => {
    const widget = document.querySelector('altcha-widget');
    if (!widget) return true; // No widget = native app, proceed
    const input = widget.querySelector('input[type="hidden"]') as HTMLInputElement | null;
    return input && input.value.length > 0;
  }, { timeout: 15000 });
  
  // Make sure the scratch directory exists and save screenshot
  await page.screenshot({ path: 'scratch/login-before-submit.png' });

  await page.locator('button[type="submit"]').click();
  
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'scratch/login-after-submit.png' });

  // Log toast if visible
  const toast = page.locator('[role="status"]').first();
  if (await toast.isVisible().catch(() => false)) {
    const text = await toast.textContent().catch(() => '');
    console.log(`[PAGE TOAST]: ${text}`);
  }
}

/** Submit a TOTP code and wait for the toast response */
async function submitTotpCode(page: import('@playwright/test').Page, code: string): Promise<string> {
  const input = page.locator('#totp-code');
  await input.fill(code);
  await page.locator('button:has-text("Verify")').click();

  // Wait for the toast to appear — Radix toasts use [data-state="open"] on <li> role="status"
  // The toast has a title ("Verification Failed") and a description (the actual error message).
  // We need the description text to distinguish "Invalid verification code" from "Rate limit exceeded"
  await page.waitForTimeout(1500);

  // Grab all visible toast text
  const toastText = await page.locator('[role="status"]').first().textContent() ?? '';
  return toastText;
}

// ---------------------------------------------------------------------------
// Tests — run sequentially, share rate limiter state across the describe block
// ---------------------------------------------------------------------------

test.describe.serial('TOTP Attack Vector Validation', () => {
  test.beforeAll(async () => {
    await setupTotpUser();
  });

  test.afterAll(async () => {
    await teardownTotpUser();
  });

  test('Attack 1: Password login gates behind TOTP — 2FA screen appears, no session cookie', async ({ page }) => {
    await loginWithPassword(page);

    await expect(page.locator('text=Two-Factor Auth')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#totp-code')).toBeVisible();
    await expect(page.locator('button:has-text("Verify")')).toBeVisible();

    // No session cookie should be set before TOTP verification
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name === 'tribes_session');
    expect(sessionCookie).toBeUndefined();
  });

  test('Attack 2: Brute-force TOTP — rate limiter blocks on 6th attempt', async ({ page }) => {
    await loginWithPassword(page);
    await expect(page.locator('text=Two-Factor Auth')).toBeVisible({ timeout: 10000 });

    const wrongCodes = ['111111', '222222', '333333', '444444', '555555', '666666'];
    let rateLimited = false;

    for (let i = 0; i < wrongCodes.length; i++) {
      const toastText = await submitTotpCode(page, wrongCodes[i]);
      console.log(`Attempt ${i + 1}: "${toastText.trim()}"`);

      if (/rate limit/i.test(toastText)) {
        rateLimited = true;
        console.log(`✅ Rate limiter triggered on attempt ${i + 1}`);
        break;
      }

      // Dismiss any toasts before next attempt
      await page.waitForTimeout(300);
    }

    expect(rateLimited).toBe(true);
  });

  test('Attack 3: Challenge token is opaque — no raw userId in DOM', async ({ page }) => {
    await loginWithPassword(page);
    await expect(page.locator('text=Two-Factor Auth')).toBeVisible({ timeout: 10000 });

    // The raw user ID must never appear in the DOM
    const bodyText = await page.locator('body').textContent();
    expect(bodyText).not.toContain(TEST_USER_ID);

    // No session cookie set
    const cookies = await page.context().cookies();
    expect(cookies.find(c => c.name === 'tribes_session')).toBeUndefined();
  });

  test('Attack 4: Cancel returns to login cleanly', async ({ page }) => {
    await loginWithPassword(page);
    await expect(page.locator('text=Two-Factor Auth')).toBeVisible({ timeout: 10000 });

    await page.locator('text=Cancel & Return to Login').click();

    // Back on the login form, no session
    await expect(page.locator('text=Two-Factor Auth')).not.toBeVisible();
    await expect(page.locator('text=Tribes Login')).toBeVisible();
    const cookies = await page.context().cookies();
    expect(cookies.find(c => c.name === 'tribes_session')).toBeUndefined();
  });
});
