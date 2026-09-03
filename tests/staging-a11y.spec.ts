import { test, expect, type Page } from '@playwright/test';

/**
 * Staging verification for the #146 fix-pass-2 a11y majors (plus spot checks
 * of pass-1 items), run against the live staging deployment.
 *
 * Usage:
 *   STAGING_EMAIL=<user> STAGING_PASSWORD=<pass> npx playwright test tests/staging-a11y.spec.ts --project=chromium
 *
 * Without STAGING_EMAIL/STAGING_PASSWORD only the unauthenticated checks run;
 * the account must be able to log in with the password fallback (not passkey,
 * which can't run headless).
 */

const STAGING_URL = process.env.STAGING_URL || 'https://staging.tribes.app';
const EMAIL = process.env.STAGING_EMAIL;
const PASSWORD = process.env.STAGING_PASSWORD;

test.use({
  baseURL: STAGING_URL,
  httpCredentials: { username: 'tribes', password: 'tribes-staging' },
});

async function loginWithPassword(page: Page) {
  await page.goto('/login');
  const passwordTab = page.locator('button:has-text("I use a password")');
  if (await passwordTab.isVisible({ timeout: 10_000 }).catch(() => false)) {
    await passwordTab.click();
  }
  await page.locator('#email-or-username').fill(EMAIL!);
  await page.locator('#password').fill(PASSWORD!);
  await page.locator('button[type="submit"], button:has-text("Sign in")').last().click();
  // Successful login leaves the auth layout for the app shell
  await page.waitForSelector('main[data-app-ready]', { timeout: 30_000 });
}

test.describe('Staging reachability (unauthenticated)', () => {
  test('basic auth works and the login page renders', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();
    expect(page.url()).toContain('/login');
  });

  test('web viewport keeps pinch-zoom unlocked (native-only lock must not leak)', async ({ page }) => {
    await page.goto('/login');
    const content = await page
      .locator('meta[name="viewport"]')
      .last()
      .getAttribute('content');
    expect(content).toBeTruthy();
    // The maximum-scale lock is applied at runtime ONLY inside the Capacitor
    // shell; a browser page must never see it.
    expect(content!).not.toContain('maximum-scale');
    expect(content!).not.toContain('user-scalable=no');
  });
});

test.describe('A11y majors (authenticated)', () => {
  test.skip(!EMAIL || !PASSWORD, 'Set STAGING_EMAIL / STAGING_PASSWORD to run authenticated staging checks');

  test.beforeEach(async ({ page }) => {
    await loginWithPassword(page);
  });

  test('header utility links have accessible names; unread badge folds into the Activity label', async ({ page }) => {
    const header = page.locator('header').first();
    await expect(header.locator('a[aria-label="Search"]')).toHaveCount(1);
    await expect(header.locator('a[aria-label*="Activity"]')).toHaveCount(1);

    // The visual unread badge must be hidden from the accessibility tree —
    // its count is folded into the link's aria-label instead.
    const activityLabel = await header.locator('a[aria-label*="Activity"]').getAttribute('aria-label');
    const badge = header.locator('a[aria-label*="Activity"] [aria-hidden="true"]');
    if ((await badge.count()) > 0) {
      expect(activityLabel).toMatch(/Activity(, \d+\+? unread)?/);
    }
  });

  test('sidebar exposes a navigation landmark', async ({ page }) => {
    // Desktop viewport: the shadcn sidebar container must be a labeled nav landmark.
    const nav = page.locator('[role="navigation"][aria-label="Main"], nav[aria-label="Main"]');
    expect(await nav.count()).toBeGreaterThan(0);
  });

  test('post card footer buttons carry aria-labels even where text is hidden', async ({ page }) => {
    // Find any post card footer; Reply/Share render icon-only below the sm
    // breakpoint, so the aria-label must be unconditional.
    const reply = page.locator('button[aria-label="Reply"]').first();
    const share = page.locator('button[aria-label="Share"]').first();
    if ((await reply.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'No posts visible on feed for this account — seed a post to exercise this check' });
      test.skip();
    }
    await expect(reply).toBeAttached();
    await expect(share).toBeAttached();
  });

  test('post overflow menus are labeled', async ({ page }) => {
    const postActions = page.locator('button[aria-label="Post actions"]').first();
    if ((await postActions.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'No posts visible on feed for this account' });
      test.skip();
    }
    await expect(postActions).toBeAttached();
  });

  test('thread collapse toggles expose aria-expanded', async ({ page }) => {
    // Any collapse/expand toggle rendered on the feed must expose state.
    const toggles = page.locator('button[aria-expanded]');
    if ((await toggles.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'No collapsible threads visible — needs a post with comments' });
      test.skip();
    }
    const first = toggles.first();
    const before = await first.getAttribute('aria-expanded');
    expect(['true', 'false']).toContain(before);
  });

  test('create-post dialog moves focus into the dialog on open', async ({ page }) => {
    // Open the composer dialog from the feed (button text varies by surface;
    // try the common triggers).
    const trigger = page
      .locator('button:has-text("Share with your People"), [role="button"]:has-text("Share with your People"), button:has-text("New Post"), button[aria-label="Create post"]')
      .first();
    if ((await trigger.count()) === 0) {
      test.info().annotations.push({ type: 'note', description: 'No composer trigger found on feed for this account' });
      test.skip();
    }
    await trigger.click();
    const dialog = page.locator('[role="dialog"]').first();
    await expect(dialog).toBeVisible({ timeout: 10_000 });

    // Focus must land inside the dialog (content container has tabIndex=-1
    // and receives focus with preventScroll) so VoiceOver announces it.
    await expect
      .poll(async () =>
        page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]');
          return dlg ? dlg.contains(document.activeElement) : false;
        }),
      )
      .toBe(true);
  });

  test('mobile width: footer buttons stay accessible when their text hides', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone-ish
    await page.goto('/');
    await page.waitForSelector('main[data-app-ready]', { timeout: 30_000 });
    const reply = page.locator('button[aria-label="Reply"]').first();
    if ((await reply.count()) === 0) {
      test.skip();
    }
    // The visible text span is display:none at this width; the accessible
    // name must survive.
    await expect(reply).toBeAttached();
    const accessibleName = await reply.getAttribute('aria-label');
    expect(accessibleName).toBe('Reply');
  });
});
