/**
 * back-navigation.spec.ts
 *
 * Regression tests for the back-navigation system.
 *
 * Covered scenarios:
 *   1. In-page "Back" button from /post/:id → /your-comms
 *   2. Browser back button (page.goBack()) from /post/:id → /your-comms
 *   3. In-page "Back" button from a cold-load of /post/:id (no prior history)
 *   4. target="_blank" internal links are NOT intercepted by the click handler
 *      (new tab opens, current tab stays put)
 *
 * Run: npx playwright test tests/back-navigation.spec.ts
 */

import { test, expect } from '@playwright/test';

// ── Shared login helper ──────────────────────────────────────────────────────

async function loginAsDustin(page: any) {
  // Navigate to the app directly — auth middleware will redirect to /login if needed.
  // This avoids the localhost.clear() / re-render race that caused the old helper
  // to time out when auth state was in a partially-cleared state after navigations.
  await page.goto('http://localhost:9002/your-comms', { waitUntil: 'networkidle' });

  // If auth middleware redirected us to /login, use the dev quick-login button
  if (new URL(page.url()).pathname.startsWith('/login')) {
    await page.waitForSelector('button:has-text("Dustin")', { state: 'visible', timeout: 10_000 });
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms', { timeout: 30_000, waitUntil: 'commit' });
  }
  // Otherwise we're already on /your-comms — nothing to do
}


// ── Helper: find a post link from the feed ──────────────────────────────────
// Activity/notifications tab items are <div onClick>, not <a> tags.
// The Feed tab (main content stream) renders posts as proper <a href> links.

async function getFirstPostUrl(page: any): Promise<string> {
  // Try to find an anchor post link directly first (Feed tab)
  const directLink = page.locator('a[href*="/post/"]').first();
  const hasLink = await directLink.count() > 0;

  if (!hasLink) {
    // Switch to Feed tab if on Activity tab
    const feedTab = page.locator('button, a').filter({ hasText: 'Feed' }).first();
    if (await feedTab.count() > 0) {
      await feedTab.click();
      await page.waitForTimeout(2_000);
    }
  }

  // Wait up to 10s for a post anchor to appear
  const found = await page.waitForSelector('a[href*="/post/"]', { timeout: 10_000 }).catch(() => null);
  if (!found) {
    // Absolute fallback: use a known seeded post (ai_post_1 in AI Innovators tribe)
    return 'http://localhost:9002/post/ai_post_1';
  }

  const href = await page.getAttribute('a[href*="/post/"]', 'href') ?? '';
  return href.startsWith('http') ? href : `http://localhost:9002${href}`;
}

// ────────────────────────────────────────────────────────────────────────────

test.describe('Back Navigation', () => {
  test.beforeEach(async ({ page }) => {
    // Forward browser console errors to the test terminal for easier debugging
    page.on('console', (msg: any) => {
      if (msg.type() === 'error') {
        console.error('[BROWSER]', msg.text());
      }
    });
  });

  // ── 1. In-page Back button (normal flow: feed → post → back) ──────────────

  test('in-page Back button from post returns to feed', async ({ page }) => {
    await loginAsDustin(page);

    // Navigate to a post by clicking from the feed
    const postUrl = await getFirstPostUrl(page);
    await page.goto(postUrl);
    await page.waitForLoadState('networkidle');

    // Confirm we're on a post page
    expect(page.url()).toMatch(/\/post\//);

    // Click the in-page "Back" button
    const backButton = page.locator('button', { hasText: /^Back$/ }).first();
    await expect(backButton).toBeVisible({ timeout: 5_000 });
    await backButton.click();

    // Should land on /your-comms (or a tribe page if post came from a tribe)
    await page.waitForURL(
      (url) => !url.pathname.startsWith('/post/'),
      { timeout: 10_000 },
    );

    const finalPath = new URL(page.url()).pathname;
    expect(finalPath).not.toMatch(/^\/post\//);
    // The deterministic parent route for /post/:id is /your-comms
    expect(finalPath).toBe('/your-comms');
  });

  // ── 2. Browser back button (page.goBack()) ────────────────────────────────

  test('browser back button from post returns to feed (not blank or Google)', async ({ page }) => {
    await loginAsDustin(page);

    const feedUrl = page.url(); // /your-comms

    // Navigate to a post via router.push (simulates clicking a link in-app)
    const postUrl = await getFirstPostUrl(page);
    await page.goto(postUrl);
    await page.waitForLoadState('networkidle');

    expect(page.url()).toMatch(/\/post\//);

    // Simulate browser back button
    await page.goBack({ waitUntil: 'networkidle' });

    const finalUrl = page.url();
    const finalPath = new URL(finalUrl).pathname;

    // Must NOT be blank, Google, or still on the post page
    expect(finalUrl).not.toBe('about:blank');
    expect(finalUrl).not.toMatch(/google\.com/);
    expect(finalPath).not.toMatch(/^\/post\//);

    // Should be back on /your-comms
    expect(finalPath).toBe('/your-comms');
  });

  // ── 3b. THE REAL REPORTED BUG: feed (via redirect) → click post → tribe → back×2 ──
  // User flow: / → redirect → /your-comms → click post link → /post/:id → click tribe → /t/:slug
  // Before fix: back×2 landed on Google because the layout injection bailed out on
  // /your-comms (it skipped injection when currentPath === '/your-comms').
  // After fix: the prev-pathname ref detects feed→post transition and injects /your-comms.

  test('feed-redirect → post → tribe → back×2 lands on feed (not Google)', async ({ page }) => {
    await loginAsDustin(page);
    // loginAsDustin → page.goto('/your-comms') → layout mounts → injection fires:
    //   history: [..., /your-comms(S1), /your-comms]

    // Get a post URL via the helper (switches to Feed tab if needed)
    const postUrl = await getFirstPostUrl(page);
    const postPath = new URL(postUrl).pathname;

    // Navigate to the post via page.goto (full load — layout remounts → injection fires again):
    //   history: [..., /your-comms(S1), /your-comms, /your-comms(S2), /post/:id]
    // The double sentinel is harmless: back from post still lands on /your-comms(S2).
    await page.goto(postUrl, { waitUntil: 'load' });
    expect(new URL(page.url()).pathname).toBe(postPath);

    // Find a tribe link within the post's main content (not sidebar).
    // Use explicit timeout on getAttribute so we fail fast if no tribe link.
    const tribeHref = await page.locator('main a[href^="/t/"]').first()
      .getAttribute('href', { timeout: 8_000 })
      .catch(() => null);

    if (!tribeHref) {
      test.skip(); // post not in a tribe
      return;
    }

    // SPA-click tribe link: layout stays mounted, no new injection.
    // History: [..., /your-comms(S2), /post/:id, /t/:slug]
    await page.locator(`a[href="${tribeHref}"]`).first().click();
    await page.waitForURL(`**${tribeHref}`, { timeout: 15_000, waitUntil: 'commit' });
    expect(new URL(page.url()).pathname).toMatch(/^\/t\//);

    // Back 1: tribe → post ✓
    await page.goBack({ waitUntil: 'load' });
    expect(new URL(page.url()).pathname).toBe(postPath);

    // Back 2: post → /your-comms ✓ (was Google before this fix)
    await page.goBack({ waitUntil: 'load' });
    expect(new URL(page.url()).pathname).toBe('/your-comms');
  });

  // ── 3. THE REPORTED BUG: cold post → tribe → back×2 → feed (not Google) ──

  test('cold deep-link: post → tribe → back×2 lands on feed', async ({ page }) => {
    await loginAsDustin(page);

    // Navigate to the feed first to find a post with a tribe link
    await page.waitForLoadState('networkidle');

    // Switch to the Feed tab to find posts (activity items are divs, not anchors)
    const feedTab = page.locator('button, a').filter({ hasText: 'Feed' }).first();
    if (await feedTab.count() > 0) {
      await feedTab.click();
      await page.waitForLoadState('networkidle');
    }

    // Find a post link in the feed (these ARE anchor tags)
    const postLink = page.locator('a[href*="/post/"]').first();
    const hasPostLink = await postLink.count() > 0;

    let postUrl: string;
    if (hasPostLink) {
      const href = await postLink.getAttribute('href') ?? '';
      postUrl = href.startsWith('http') ? href : `http://localhost:9002${href}`;
    } else {
      // Fallback: use a known seeded post (ai_post_1 in AI Innovators tribe)
      postUrl = 'http://localhost:9002/post/ai_post_1';
    }

    // Hard-navigate directly to the post (simulates push notification deep link)
    await page.goto(postUrl, { waitUntil: 'networkidle' });
    expect(page.url()).toMatch(/\/post\//);

    // Click the tribe link from the post header
    const tribeLink = page.locator('a[href*="/t/"]').first();
    await expect(tribeLink).toBeVisible({ timeout: 8_000 });
    await tribeLink.click();
    await page.waitForURL('**/t/**', { timeout: 10_000 });
    expect(page.url()).toMatch(/\/t\//);

    // Back 1: tribe → post ✓
    await page.goBack({ waitUntil: 'networkidle' });
    expect(new URL(page.url()).pathname).toMatch(/^\/post\//);

    // Back 2: post → feed ✓ (was: Google/blank before synthetic history injection)
    await page.goBack({ waitUntil: 'networkidle' });
    const finalPath = new URL(page.url()).pathname;
    expect(finalPath).toBe('/your-comms');
  });

  // ── 4. target="_blank" internal links are NOT eaten by click interceptor ──

  test('target="_blank" internal links open a new tab, not navigate in-place', async ({ page, context }) => {
    await loginAsDustin(page);

    // Go to signup page which has target="_blank" links to /terms and /privacy
    await page.goto('http://localhost:9002/signup', { waitUntil: 'networkidle' });

    // Listen for new page (new tab) being opened
    const [newPage] = await Promise.all([
      context.waitForEvent('page', { timeout: 8_000 }),
      // Click the Terms of Service link (target="_blank")
      page.click('a[href="/terms"]'),
    ]);

    // New tab should open /terms
    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toMatch(/\/terms/);

    // Original tab should still be on /signup — NOT navigated away
    expect(new URL(page.url()).pathname).toBe('/signup');
  });

  // ── 5. Non-Tribes external links open normally (not intercepted) ──────────

  // ── 5. External links are NOT intercepted by the click interceptor ──────────
  // Injects a synthetic external link directly into the DOM so the test is
  // self-contained — no dependency on seed posts containing third-party URLs.

  test('external links bypass the click interceptor', async ({ page, context }) => {
    await loginAsDustin(page);
    await page.waitForLoadState('networkidle');

    // ── 5a. Plain external anchor (no target attr) ────────────────────────────
    // The interceptor checks isInternal (hostname must match app host).
    // An external href like https://example.com should not be intercepted.
    await page.evaluate(() => {
      const a = document.createElement('a');
      a.id = 'test-external-link';
      a.href = 'https://example.com/test-external';
      a.textContent = 'External link';
      document.body.appendChild(a);
    });

    const urlBefore = page.url();

    // Clicking a plain external link should trigger a new navigation (not SPA push).
    // In Playwright, a non-intercepted cross-origin navigation causes the page URL to change.
    // We verify the interceptor did NOT call e.preventDefault() by checking the URL
    // changes away from /your-comms.
    const externalA = page.locator('#test-external-link');
    await expect(externalA).toBeVisible();

    // Wrap the click in a navigation promise — if the interceptor wrongly calls
    // router.push() the URL stays on /your-comms; if it's bypassed the browser navigates.
    let navigated = false;
    page.once('framenavigated', () => { navigated = true; });
    await externalA.click({ timeout: 3_000 }).catch(() => {}); // May throw if navigation happens
    // Give the browser a moment to navigate
    await page.waitForTimeout(500);

    // The page should have navigated away (external link not blocked by interceptor)
    expect(navigated || page.url() !== urlBefore).toBe(true);

    // Re-navigate back to the app — use 'load' not 'networkidle':
    // the app's WebSocket/SSE connections prevent networkidle from firing.
    await page.goto('http://localhost:9002/your-comms', { waitUntil: 'load' });

    await page.evaluate(() => {
      const a = document.createElement('a');
      a.id = 'test-blank-link';
      a.href = 'https://example.com/blank-test';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'New-tab external link';
      document.body.appendChild(a);
    });

    const blankLink = page.locator('#test-blank-link');
    await expect(blankLink).toBeVisible();

    const [newTab] = await Promise.all([
      context.waitForEvent('page', { timeout: 5_000 }),
      blankLink.click(),
    ]);

    // New tab should open
    await newTab.waitForLoadState('domcontentloaded');
    expect(newTab.url()).toContain('example.com');

    // Original tab must still be on /your-comms (not navigated in-place)
    expect(new URL(page.url()).pathname).toBe('/your-comms');

    await newTab.close();
  });
});
