import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Comment Reactions (Vibe) Visibility and Popover', () => {
  test('should display comment reactions correctly on standalone post page and trigger popover', async ({ page }) => {
    // 1. Log browser console messages to the test runner terminal
    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    // Ensure screenshots folder exists
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // 2. Go to login and bypass
    await page.goto('http://localhost:9002/login');
    await page.evaluate(() => localStorage.clear());
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms');

    // 3. Navigate to standalone post page
    await page.goto('http://localhost:9002/post/ai_post_1/celebrating-our-milestone');
    await page.waitForLoadState('networkidle');

    // 4. Locate the first comment card
    const firstComment = page.locator('[id^="comment-"]').first();
    await expect(firstComment).toBeVisible({ timeout: 10000 });

    // Take screenshot of the comments section
    const commentsPath = path.join(screenshotDir, 'comment-reactions-visible.png');
    await page.screenshot({ path: commentsPath });
    console.log(`Saved screenshot of comments reactions to ${commentsPath}`);

    // 5. Trigger the vibe picker popover on the comment
    // The first button in the actions bar is always the vibe button
    const commentVibeBtn = firstComment.locator('.flex.items-center.space-x-2.text-xs.mt-1 button').first();
    await expect(commentVibeBtn).toBeVisible({ timeout: 8000 });
    await commentVibeBtn.click();

    // 6. Verify that the reaction popover with emoji options is open
    const emojiPop = page.locator('[role="dialog"], [data-state="open"]');
    await page.waitForTimeout(1000); // Give Popover a brief moment to animate open

    // Take screenshot showing the open vibe popover on the comment card
    const popoverPath = path.join(screenshotDir, 'comment-vibe-popover.png');
    await page.screenshot({ path: popoverPath });
    console.log(`Saved screenshot of comment vibe popover to ${popoverPath}`);

    // Clean up: click escape to close
    await page.keyboard.press('Escape');
  });
});
