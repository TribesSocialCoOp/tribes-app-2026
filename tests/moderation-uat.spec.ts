
import { test, expect } from '@playwright/test';

// The JWT we generated for test-service-admin
const ADMIN_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ0ZXN0LXNlcnZpY2UtYWRtaW4iLCJzZXNzaW9uSWQiOiJ1YXQtc2Vzc2lvbi1zZGpmb2ciLCJleHBpcmVzIjoiMjAyNi0wNS0yMlQxOToxNjowNi42MzBaIiwiZGVsZXRpb25SZXF1ZXN0ZWRBdCI6bnVsbCwiaWF0IjoxNzc4ODcyNTY2LCJleHAiOjE3Nzk0NzczNjZ9.tJO1zdMBpyn3KsbQQFbpMzRmM5WFmLhZ_HOUAE96ukw';

test.describe('Moderation Infrastructure UAT', () => {

  test.beforeEach(async ({ context }) => {
    // Inject the admin session cookie
    await context.addCookies([{
      name: 'tribes_session',
      value: ADMIN_JWT,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    }]);
  });

  test('Tombstone rendering: removed post should not leak original content', async ({ page }) => {
    // Setup: Ensure welcome_post_1 is removed
    // (In a real CI we'd use a test DB, here we're using the dev DB)
    
    await page.goto('http://localhost:9002/tribes/welcome');
    
    // Find the tombstone for welcome_post_1 (which we removed in the previous step)
    // If it's not removed, we'll try to find any removed post or assume the first one is removed
    const tombstone = page.locator('div:has-text("POST REMOVED")').first();
    await expect(tombstone).toBeVisible();
    
    // Verify reason is shown
    await expect(tombstone).toContainText('Testing tombstone rendering');
    
    // CRITICAL SECURITY CHECK: Ensure original title/content is NOT in the DOM
    const originalTitle = 'Welcome to Tribes! 🎉 Start Here';
    const originalTitleCount = await page.evaluate((title) => {
      const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
      let count = 0;
      let node;
      while (node = walk.nextNode()) {
        if (node.textContent?.includes(title)) count++;
      }
      return count;
    }, originalTitle);
    
    console.log(`Original title count: ${originalTitleCount}`);
    expect(originalTitleCount).toBe(0);
    
    // Verify action buttons on tombstone
    await expect(page.locator('button:has-text("Delete Permanently")')).toBeVisible();
  });

  test('Mod controls: tribe speaker should see "Remove Post (Mod)"', async ({ page }) => {
    await page.goto('http://localhost:9002/tribes/ai-innovators');
    
    // Click kebab menu on a post (post ID: ai_post_1)
    const post = page.locator('div:has-text("The future of Agentic Workflows")').first();
    await post.locator('button[aria-haspopup="menu"]').click();
    
    // Verify "Remove Post (Mod)" exists
    await expect(page.locator('div[role="menuitem"]:has-text("Remove Post (Mod)")')).toBeVisible();
    
    // Click it to verify dialog opens
    await page.locator('div[role="menuitem"]:has-text("Remove Post (Mod)")').click();
    await expect(page.locator('h2:has-text("Remove Content")')).toBeVisible();
    await expect(page.locator('label:has-text("Spam / Self-promotion")')).toBeVisible();
    await expect(page.locator('label:has-text("Prevent author from reposting")')).toBeVisible();
  });

  test('Admin controls: global admin should see "Delete Post (Admin)" in all locations', async ({ page }) => {
    // 1. In tribe feed
    await page.goto('http://localhost:9002/tribes/ai-innovators');
    const post = page.locator('div:has-text("The future of Agentic Workflows")').first();
    await post.locator('button[aria-haspopup="menu"]').click();
    await expect(page.locator('div[role="menuitem"]:has-text("Delete Post (Admin)")')).toBeVisible();
    
    // 2. In Intercom feed
    await page.goto('http://localhost:9002/your-comms');
    const feedItem = page.locator('div:has-text("The future of Agentic Workflows")').first();
    await feedItem.locator('button[aria-haspopup="menu"]').click();
    await expect(page.locator('div[role="menuitem"]:has-text("Delete Post (Admin)")')).toBeVisible();
    
    // Click it to verify confirmation dialog
    await page.locator('div[role="menuitem"]:has-text("Delete Post (Admin)")').click();
    await expect(page.locator('h2:has-text("Permanently Delete Post (Admin)")')).toBeVisible();
    await expect(page.locator('text=This will permanently delete this post and all associated data')).toBeVisible();
  });
});
