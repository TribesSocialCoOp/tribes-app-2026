import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Comment Mention Autocomplete on Desktop', () => {
  test('should display autocomplete popover on desktop and complete mention without card clipping', async ({ page }) => {
    // 1. Log browser console messages to the test runner terminal
    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    // Ensure screenshots folder exists
    const screenshotDir = path.join(__dirname, 'screenshots');
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // 2. Set desktop viewport size
    await page.setViewportSize({ width: 1280, height: 800 });

    // 3. Go to login and bypass
    await page.goto('http://localhost:9002/login');
    await page.evaluate(() => localStorage.clear());
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms');

    // 4. Navigate to a post page
    await page.goto('http://localhost:9002/post/ai_post_1/celebrating-our-milestone');
    await page.waitForLoadState('networkidle');

    // 5. Click the post's "Reply" button to show the inline comment box
    const replyBtn = page.locator('button:has-text("Reply")').first();
    await expect(replyBtn).toBeVisible({ timeout: 8000 });
    await replyBtn.click();

    // 6. Locate the desktop inline comment reply box textarea
    const textarea = page.locator('textarea[placeholder="Write a reply..."]').first();
    await expect(textarea).toBeVisible({ timeout: 8000 });

    // 7. Focus the textarea and type '@@bob' to trigger autocomplete
    await textarea.focus();
    await textarea.type('@@bob', { delay: 100 });

    // 8. Verify the autocomplete popup listbox is visible
    const autocompletePopover = page.locator('[role="listbox"]');
    await expect(autocompletePopover).toBeVisible({ timeout: 8000 });

    // Verify it contains Bob Builder
    const bobOption = page.locator('li:has-text("Bob Builder")');
    await expect(bobOption).toBeVisible({ timeout: 5000 });

    // Take screenshot showing the popup triggered on mention in desktop comment reply box
    const popoverPath = path.join(screenshotDir, 'comment-mention-popover.png');
    await page.screenshot({ path: popoverPath });
    console.log(`Saved screenshot of comment mention popover to ${popoverPath}`);

    // 9. Press Enter to select the user
    await textarea.press('Enter');

    // 10. Verify the autocomplete popover is closed
    await expect(autocompletePopover).not.toBeVisible({ timeout: 5000 });

    // 11. Verify the text is cleaned up to exactly '@bob-builder '
    const val = await textarea.inputValue();
    console.log(`Textarea content after selection: "${val}"`);
    expect(val).toMatch(/^@bob-builder\s$/i);

    // Take screenshot showing the successfully inserted mention
    const successPath = path.join(screenshotDir, 'comment-mention-success.png');
    await page.screenshot({ path: successPath });
    console.log(`Saved screenshot of comment mention success to ${successPath}`);
  });
});
