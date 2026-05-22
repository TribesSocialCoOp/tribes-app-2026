import { test, expect } from '@playwright/test';

test.describe('ComposeBox Stability', () => {
  test.beforeEach(async ({ page }: { page: any }) => {
    // Log browser console messages to the test runner terminal
    page.on('console', (msg: any) => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    // Clear localStorage on login page
    await page.goto('http://localhost:9002/login');
    await page.evaluate(() => localStorage.clear());

    // Use dev bypass login
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms');

    // Expand the compose box
    const collapsedBtn = page.locator('button:has-text("What do you have to share?")');
    await collapsedBtn.click();
    await expect(page.locator('textarea')).toBeVisible();
  });

  test('should not reload page on image upload failure', async ({ page }: { page: any }) => {
    // 1. Enter some text
    const testContent = 'Stable testing content ' + Date.now();
    await page.fill('textarea', testContent);

    // 2. Mock the upload API to return 500
    await page.route('**/api/upload', (route: any) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Simulated upload failure' }),
    }));

    // 3. Attach an image
    await page.setInputFiles('input[type="file"]', {
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-data'),
    });

    // Wait for the image preview to render (ensures state has updated)
    await expect(page.locator('img[alt*="Preview"]')).toBeVisible();

    // 4. Click Post
    await page.locator('button', { hasText: /^Post$/ }).click();

    // 5. Verify toast appears
    await expect(page.locator('text=Simulated upload failure').first()).toBeVisible();

    // 6. Verify page DID NOT reload (content should still be in the textarea)
    const currentContent = await page.inputValue('textarea');
    expect(currentContent).toBe(testContent);
    
    // 7. Verify the image is still in the preview (meaning we didn't lose state)
    await expect(page.locator('img[alt*="Preview"]')).toBeVisible();
  });

  test('should handle multi-image upload successfully', async ({ page }: { page: any }) => {
    // 1. Enter some text
    const testContent = 'Multi-image success ' + Date.now();
    await page.fill('textarea', testContent);

    // 2. Mock successful uploads
    await page.route('**/api/upload', (route: any) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: '/seed/avatar-default.svg' }),
    }));

    // 3. Attach multiple images
    await page.setInputFiles('input[type="file"]', [
      {
        name: 'test0.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-image-data-0'),
      },
      {
        name: 'test1.png',
        mimeType: 'image/png',
        buffer: Buffer.from('fake-image-data-1'),
      }
    ]);

    // Wait for both image previews to render (ensures state has updated)
    await expect(page.locator('img[alt="Preview 0"]')).toBeVisible();
    await expect(page.locator('img[alt="Preview 1"]')).toBeVisible();

    // 4. Click Post
    await page.locator('button', { hasText: /^Post$/ }).click();

    // 5. Verify success toast or feed refresh
    // Since we're mocking, the server action 'createRingPost' might still fail if it's not mocked,
    // but the 'onPostCreated' should be triggered if the upload succeeded.
    // Let's check for "Posted" toast
    await expect(page.locator('text=Posted').first()).toBeVisible({ timeout: 10000 });

    // 6. Verify the ComposeBox is collapsed (button visible, textarea not visible)
    const collapsedBtn = page.locator('button:has-text("What do you have to share?")');
    await expect(collapsedBtn).toBeVisible();

    // Re-expand it to verify the content inside the textarea was cleared
    await collapsedBtn.click();
    const currentContent = await page.inputValue('textarea');
    expect(currentContent).toBe('');
  });
});
