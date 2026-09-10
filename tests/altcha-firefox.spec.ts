import { test, expect } from '@playwright/test';

// Triage for a report that ALTCHA "isn't working" on Firefox. Desktop Firefox with a
// default profile verified cleanly in manual testing, so this runs the signup flow
// across a small matrix of Firefox configs (see playwright.config.ts: firefox,
// firefox-strict-etp, firefox-private) to try to isolate the config that breaks it —
// Strict Enhanced Tracking Protection and Private Browsing are the two most likely
// culprits since both can block the widget's dynamic `import('altcha')` or its
// challenge fetch as tracking/fingerprinting.
test.describe('ALTCHA widget on Firefox', () => {
  test('signup page renders a real verified widget, not the insecure-dev-bypass fallback', async ({ page }, testInfo) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => pageErrors.push(err.message));

    await page.goto('http://localhost:9002/signup');

    // The widget renders one of two states: the real <altcha-widget> custom element
    // (secure context, crypto.subtle available) or the "Local Dev Bypass" placeholder
    // (AltchaWidget's isSecureContext/crypto.subtle guard failed). Landing in bypass
    // mode against what should be a secure origin is itself the bug we're hunting —
    // the server rejects that sentinel payload in production, which reads to a user
    // as "it's just stuck" or "verification failed".
    const realWidget = page.locator('altcha-widget');
    const devBypass = page.locator('text=Local Dev Bypass');

    await Promise.race([
      realWidget.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {}),
      devBypass.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    ]);

    const usedBypass = await devBypass.isVisible().catch(() => false);
    testInfo.annotations.push({
      type: 'altcha-mode',
      description: usedBypass ? 'insecure-dev-bypass (unexpected on a secure origin)' : 'real widget',
    });
    expect(usedBypass, 'ALTCHA fell back to insecure-dev-bypass instead of rendering the real widget').toBe(false);

    // Real widget: wait for it to reach the verified state instead of hanging in
    // "verifying"/"unverified" (a PoW loop stalled by a blocked worker/fetch is the
    // most likely Strict-ETP failure mode).
    await expect(page.locator('text=Verified')).toBeVisible({ timeout: 20000 });

    expect(pageErrors, `Uncaught page errors: ${pageErrors.join('\n')}`).toEqual([]);
    expect(
      consoleErrors.filter((e) => !e.includes('favicon')),
      `Console errors: ${consoleErrors.join('\n')}`
    ).toEqual([]);
  });

  test('challenge request succeeds (not blocked as a tracker)', async ({ page }) => {
    const challengeResponse = page.waitForResponse((res) => res.url().includes('/api/altcha/challenge'), {
      timeout: 15000,
    }).catch(() => null);

    await page.goto('http://localhost:9002/signup');
    const response = await challengeResponse;

    // A null response means the request never fired at all — e.g. Strict ETP or an
    // extension-equivalent blocklist swallowed it before it left the page, which
    // devtools' Network tab would show as "blocked by content blocker".
    expect(response, 'GET /api/altcha/challenge never fired — likely blocked by tracking protection').not.toBeNull();
    expect(response?.ok()).toBe(true);
  });
});
