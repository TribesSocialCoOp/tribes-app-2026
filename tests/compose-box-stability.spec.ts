import { test, expect } from '@playwright/test';

test.describe('ComposeBox Stability', () => {
  test.beforeEach(async ({ page }: { page: any }) => {
    // Navigate to login and use dev bypass
    await page.goto('http://localhost:9002/login');
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms');
  });

  test('should not reload page on image upload failure', async ({ page }: { page: any }) => {
    // 1. Enter some text
    const testContent = 'Stable testing content ' + Date.now();
    await page.fill('textarea[placeholder*="Share your thoughts"]', testContent);

    // 2. Mock the upload API to return 500
    await page.route('**/api/upload', (route: any) => route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Simulated upload failure' }),
    }));

    // 3. Attach an image
    // Note: We use a buffer to simulate a file upload
    const fileChooserPromise = page.waitForEvent('filechooser');
    await page.click('button:has-text("Image"), .lucide-image'); // Click image button
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: 'test.png',
      mimeType: 'image/png',
      buffer: Buffer.from('fake-image-data'),
    });

    // 4. Click Post
    await page.click('button:has-text("Post")');

    // 5. Verify toast appears
    await expect(page.locator('text=Failed to upload images')).toBeVisible();

    // 6. Verify page DID NOT reload (content should still be in the textarea)
    const currentContent = await page.inputValue('textarea[placeholder*="Share your thoughts"]');
    expect(currentContent).toBe(testContent);
    
    // 7. Verify the image is still in the preview (meaning we didn't lose state)
    await expect(page.locator('img[alt*="Preview"]')).toBeVisible();
  });

  test('should handle multi-image upload successfully', async ({ page }: { page: any }) => {
    // 1. Enter some text
    const testContent = 'Multi-image success ' + Date.now();
    await page.fill('textarea[placeholder*="Share your thoughts"]', testContent);

    // 2. Mock successful uploads
    await page.route('**/api/upload', (route: any) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'http://example.com/image.png' }),
    }));

    // 3. Attach multiple images
    for (let i = 0; i < 2; i++) {
      const fileChooserPromise = page.waitForEvent('filechooser');
      await page.click('button:has-text("Image"), .lucide-image');
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles({
        name: `test${i}.png`,
        mimeType: 'image/png',
        buffer: Buffer.from(`fake-image-data-${i}`),
      });
    }

    // 4. Click Post
    await page.click('button:has-text("Post")');

    // 5. Verify success toast or feed refresh
    // Since we're mocking, the server action 'createRingPost' might still fail if it's not mocked,
    // but the 'onPostCreated' should be triggered if the upload succeeded.
    // Let's check for "Post Created" toast
    await expect(page.locator('text=Post Created')).toBeVisible();

    // 6. Verify the ComposeBox is cleared
    const currentContent = await page.inputValue('textarea[placeholder*="Share your thoughts"]');
    expect(currentContent).toBe('');
  });
});
