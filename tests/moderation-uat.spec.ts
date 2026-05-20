
import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes';

async function withDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test.describe('Moderation Infrastructure UAT', () => {

  test.beforeAll(async () => {
    await withDb(async (client) => {
      // Setup welcome_post_1 to be removed for the tombstone test
      await client.query(
        `UPDATE posts 
         SET is_removed = true, removal_reason = 'Testing tombstone rendering' 
         WHERE id = 'welcome_post_1'`
      );
      // Ensure ai_post_1 is active
      await client.query(
        `UPDATE posts 
         SET is_removed = false, removal_reason = NULL 
         WHERE id = 'ai_post_1'`
      );
    });
  });

  test.afterAll(async () => {
    // Restore posts
    await withDb(async (client) => {
      await client.query(
        `UPDATE posts 
         SET is_removed = false, removal_reason = NULL 
         WHERE id = 'welcome_post_1'`
      );
    });
  });

  test.beforeEach(async ({ page }) => {
    // Navigate to login and use dev bypass
    await page.goto('http://localhost:9002/login');
    await page.click('button:has-text("Test Admin")');
    await page.waitForURL('**/your-comms');
  });

  test('Tombstone rendering: removed post should not leak original content', async ({ page }) => {
    // Setup: Ensure welcome_post_1 is removed
    // (In a real CI we'd use a test DB, here we're using the dev DB)
    
    await page.goto('http://localhost:9002/t/welcome');
    
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
    await page.goto('http://localhost:9002/t/ai-innovators');
    
    // Click kebab menu on a post (post ID: ai_post_1)
    const post = page.locator('#post-ai_post_1');
    await post.locator('button.touch-target-44').first().click();
    
    // Verify "Remove Post (Mod)" exists
    await expect(page.locator('div[role="menuitem"]:has-text("Remove Post (Mod)")')).toBeVisible();
    
    // Click it to verify dialog opens
    await page.locator('div[role="menuitem"]:has-text("Remove Post (Mod)")').click();
    await expect(page.locator('h2:has-text("Remove Post")')).toBeVisible();
    await expect(page.locator('button:has-text("Spam / Self-promotion")')).toBeVisible();
    await expect(page.locator('label:has-text("Prevent author from reposting")')).toBeVisible();
  });

  test('Admin controls: global admin should see "Delete Post (Admin)" in all locations', async ({ page }) => {
    // 1. In tribe feed
    await page.goto('http://localhost:9002/t/ai-innovators');
    const post = page.locator('#post-ai_post_1');
    await post.locator('button.touch-target-44').first().click();
    await expect(page.locator('div[role="menuitem"]:has-text("Delete Post (Admin)")')).toBeVisible();
    
    // 2. In Intercom feed
    await page.goto('http://localhost:9002/your-comms');
    const feedItem = page.locator('#post-ai_post_1');
    await feedItem.locator('button.touch-target-44').first().click();
    await expect(page.locator('div[role="menuitem"]:has-text("Delete Post (Admin)")')).toBeVisible();
    
    // Click it to verify confirmation dialog
    await page.locator('div[role="menuitem"]:has-text("Delete Post (Admin)")').click();
    await expect(page.locator('h2:has-text("Permanently Delete Post (Admin)")')).toBeVisible();
    await expect(page.locator('text=This will permanently delete this post and all associated data')).toBeVisible();
  });
});
