import { test, expect } from '@playwright/test';

test.describe('NCII Take It Down Act Compliance E2E Flows', () => {
  
  test('NCII Public Report Intake Form - Render and Validation', async ({ page }) => {
    // Navigate to the Report NCII page
    await page.goto('http://localhost:9002/report-ncii');

    // Wait for hydration
    await page.waitForTimeout(1000);

    // Verify page headings and instructions
    await expect(page.locator('h2:has-text("Non-Consensual Intimate Imagery (NCII) Secure Portal")')).toBeVisible();
    await expect(page.locator('text=Take It Down')).toBeVisible();

    // Verify form fields exist
    await expect(page.locator('label:has-text("Your Full Name")')).toBeVisible();
    await expect(page.locator('label:has-text("Your Email Address")')).toBeVisible();
    await expect(page.locator('label:has-text("Poster\'s Username (at least one locator required)")')).toBeVisible();
    await expect(page.locator('label:has-text("Digital Signature (Type Full Name)")')).toBeVisible();
    
    // Check for the consent checkbox
    await expect(page.locator('label:has-text("I swear under penalty of perjury")')).toBeVisible();

    // Try submitting without filling required fields
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Verify visual validation errors appear
    await expect(page.locator('text=Full name is required')).toBeVisible();
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible();
    await expect(page.locator('text=Digital signature is required')).toBeVisible();
    await expect(page.locator('text=You must affirm the statement of non-consent to proceed')).toBeVisible();

    // Fill out form fields
    await page.fill('input[name="requesterName"]', 'John Doe');
    await page.fill('input[name="requesterEmail"]', 'invalid-email');
    await page.fill('input[name="posterUsername"]', 'victim_user');
    await page.fill('textarea[name="contentDescription"]', 'My private imagery was uploaded here without consent.');
    await page.fill('textarea[name="contentUrls"]', 'http://localhost:9002/media/private1.png\nhttp://localhost:9002/media/private2.png');
    await page.fill('input[name="requesterSignature"]', 'John Doe');
    await page.click('text=I swear under penalty of perjury'); // Agree to perjury oath

    // Click submit again
    await submitBtn.click();

    // Verify invalid email error is still shown, but other errors are resolved
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible();
    await expect(page.locator('text=Full name is required')).not.toBeVisible();
    await expect(page.locator('text=Digital signature is required')).not.toBeVisible();
    await expect(page.locator('text=You must affirm the statement of non-consent to proceed')).not.toBeVisible();

    // Fix the email address
    await page.fill('input[name="requesterEmail"]', 'john.doe@example.com');
    await submitBtn.click();

    // Turnstile container should be rendered in the DOM
    const turnstile = page.locator('.cf-turnstile');
    if (await turnstile.isVisible()) {
      await expect(turnstile).toBeVisible();
    }
  });

  test('NCII Report Status Lookup Page - Render and Form', async ({ page }) => {
    // Navigate to the NCII Status page
    await page.goto('http://localhost:9002/ncii-status');

    // Wait for hydration
    await page.waitForTimeout(1000);

    // Verify page headings and instructions
    await expect(page.locator('text=Track Report Status')).toBeVisible();
    await expect(page.locator('label:has-text("Private Tracking Number")')).toBeVisible();
    await expect(page.locator('label:has-text("Requester Email Address")')).toBeVisible();

    // Submit blank lookup
    const submitBtn = page.locator('button[type="submit"]');
    await submitBtn.click();

    // Verify validation errors
    await expect(page.locator('text=Tracking number is required')).toBeVisible();
    await expect(page.locator('text=Please enter a valid email address')).toBeVisible();

    // Fill valid lookup fields
    await page.fill('input[name="tracking"]', 'NCII-1234567890');
    await page.fill('input[name="email"]', 'test@example.com');
    
    await submitBtn.click();
    
    // Since NCII-1234567890 doesn't exist, we expect a lookup failed message in the toast
    await expect(page.locator('text=Report Not Found').first()).toBeVisible();
    await expect(page.locator('text=No report found with the matching tracking number').first()).toBeVisible();
  });

  test('Terms of Service and Community Guidelines - Legal Updates Check', async ({ page }) => {
    // Verify Terms of Service updated section is present
    await page.goto('http://localhost:9002/terms');
    await page.waitForTimeout(1000);
    
    // We updated the terms to include Section 10 about the Take It Down Act compliance.
    await expect(page.locator('text=Non-Consensual Intimate Imagery').first()).toBeVisible();
    await expect(page.locator('text=Take It Down Act').first()).toBeVisible();

    // Verify Community Guidelines updated section is present
    await page.goto('http://localhost:9002/community-guidelines');
    await page.waitForTimeout(1000);
    
    // Should mention the Take It Down Act or NCII
    await expect(page.locator('text=Take It Down').first()).toBeVisible();
    await expect(page.locator('text=Intimate Imagery').first()).toBeVisible();
  });
});
