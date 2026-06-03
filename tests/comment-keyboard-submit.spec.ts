import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('Comment Keyboard Submit Convention', () => {
  test('Enter should insert newline and Ctrl/Cmd+Enter should submit', async ({ page }) => {
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

    // 3. Navigate to a post page
    await page.goto('http://localhost:9002/post/ai_post_1/celebrating-our-milestone');
    await page.waitForLoadState('networkidle');

    // 4. Click the post's "Reply" button to show the inline comment box
    const replyBtn = page.locator('button:has-text("Reply")').first();
    await expect(replyBtn).toBeVisible({ timeout: 8000 });
    await replyBtn.click();

    // 5. Locate the comment box textarea
    const textarea = page.locator('textarea[placeholder="Write a reply..."]').first();
    await expect(textarea).toBeVisible({ timeout: 8000 });

    // 6. Type line 1 and press Enter
    await textarea.focus();
    await textarea.type('Line 1 of local test comment');
    await page.keyboard.press('Enter');

    // 7. Verify that it created a newline instead of submitting
    const valAfterEnter = await textarea.inputValue();
    expect(valAfterEnter).toBe('Line 1 of local test comment\n');

    // Take screenshot of the newline
    const newlinePath = path.join(screenshotDir, 'comment-newline.png');
    await page.screenshot({ path: newlinePath });
    console.log(`Saved screenshot of comment newline to ${newlinePath}`);

    // 8. Type line 2 and press Ctrl+Enter to submit
    await textarea.type('Line 2 of local test comment');
    const valBeforeSubmit = await textarea.inputValue();
    expect(valBeforeSubmit).toBe('Line 1 of local test comment\nLine 2 of local test comment');

    // Press Control+Enter or Meta+Enter depending on platform representation in headless browser
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);

    // If textarea is still visible, try Meta+Enter (Cmd+Enter on macOS runner)
    if (await textarea.isVisible()) {
      await page.keyboard.press('Meta+Enter');
    }

    // 9. Verify the comment is sent (textarea becomes hidden/unmounted as the reply box closes)
    await expect(textarea).toBeHidden({ timeout: 10000 });

    // Verify the comment is rendered on the page
    const newComment = page.locator('text=Line 2 of local test comment').first();
    await expect(newComment).toBeVisible({ timeout: 5000 });

    // Take screenshot showing the submitted comment
    const submittedPath = path.join(screenshotDir, 'comment-submitted.png');
    await page.screenshot({ path: submittedPath });
    console.log(`Saved screenshot of submitted comment to ${submittedPath}`);
  });
});
