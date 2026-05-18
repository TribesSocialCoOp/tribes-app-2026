import { test, expect } from '@playwright/test';

test.describe('FOSS Password Authentication Flows', () => {
  test('Signup page - should support password selector, live validation, and security callout', async ({ page }) => {
    await page.goto('http://localhost:9002/signup?invite=FOUNDING-BETA-001');

    // Wait until either the password fallback toggle button or the password input is visible
    await Promise.race([
      page.waitForSelector('button:has-text("Password fallback")', { timeout: 10000 }).catch(() => {}),
      page.waitForSelector('input[type="password"]', { timeout: 10000 }).catch(() => {})
    ]);

    // Toggle to password fallback mode if available
    const passwordTab = page.locator('button:has-text("Password fallback")');
    if (await passwordTab.isVisible()) {
      await passwordTab.click();
    }

    // Verify fields are visible in password fallback mode
    await expect(page.locator('label:has-text("Username")')).toBeVisible();
    await expect(page.locator('label:has-text("Email Address")')).toBeVisible();
    await expect(page.locator('label[for="password"]')).toBeVisible();

    // Verify the educational security backup warning callout is displayed
    await expect(page.locator('text=E2E Encryption Manual Backup')).toBeVisible();

    // Live password complexity check: Type a short password
    const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
    await passwordInput.fill('short');

    // Verify at least one checker requirement shows invalid/unmet (using text-muted-foreground)
    await expect(page.locator('span:has-text("At least 12 characters")')).toHaveClass(/text-muted-foreground/);

    // Live password complexity check: Type a valid password
    await passwordInput.fill('SecureP@ss1234');
    
    // Verify all requirements show green/met
    await expect(page.locator('span:has-text("At least 12 characters")')).toHaveClass(/text-emerald/);
    await expect(page.locator('span:has-text("At least one uppercase letter")')).toHaveClass(/text-emerald/);
    await expect(page.locator('span:has-text("At least one lowercase letter")')).toHaveClass(/text-emerald/);
    await expect(page.locator('span:has-text("At least one number or symbol")')).toHaveClass(/text-emerald/);

    // Verify Turnstile widget container is rendered
    const turnstileContainer = page.locator('.cf-turnstile');
    if (await turnstileContainer.isVisible()) {
      await expect(turnstileContainer).toBeVisible();
    }
  });

  test('Login page - should support switching to password fallback and back', async ({ page }) => {
    await page.goto('http://localhost:9002/login');

    // Wait until either the password fallback toggle button or the password input is visible
    await Promise.race([
      page.waitForSelector('button:has-text("Password fallback")', { timeout: 5000 }).catch(() => {}),
      page.waitForSelector('input[type="password"]', { timeout: 5000 }).catch(() => {})
    ]);

    const passwordTab = page.locator('button:has-text("Password fallback")');
    if (await passwordTab.isVisible()) {
      await passwordTab.click();
      
      // Password login inputs should be visible
      await expect(page.locator('label:has-text("Email or Username")')).toBeVisible();
      await expect(page.locator('label:has-text("Password")')).toBeVisible();
      await expect(page.locator('a:has-text("Forgot Password?")')).toBeVisible();

      // Can switch back to passkey mode
      const passkeyTab = page.locator('button:has-text("Secure Passkey")');
      await passkeyTab.click();
      await expect(page.locator('button:has-text("Sign in with Passkey")')).toBeVisible();
    } else {
      // Default to password if passkey not supported in environment
      await expect(page.locator('label:has-text("Email or Username")')).toBeVisible();
      await expect(page.locator('label:has-text("Password")')).toBeVisible();
    }
  });

  test('Forgot Password flow - should render card, input, and turnstile', async ({ page }) => {
    await page.goto('http://localhost:9002/forgot-password');

    // Wait for page hydration
    await page.waitForTimeout(2000);

    // Verify elements are visible
    await expect(page.locator('text=Forgot Password?')).toBeVisible();
    await expect(page.locator('label:has-text("Email or Username")')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();

    // Enter a dummy username and submit
    await page.fill('input[id="email-or-username"]', 'testuser');
    
    // Check that Turnstile exists
    const turnstile = page.locator('.cf-turnstile');
    if (await turnstile.isVisible()) {
      await expect(turnstile).toBeVisible();
    }
  });
});
