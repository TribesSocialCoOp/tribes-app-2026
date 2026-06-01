import { test, expect } from '@playwright/test';

test.describe('Generate High-Fidelity UAT Screenshots', () => {
  test('Capture functional state of validated bugfixes', async ({ page }) => {
    page.on('console', (msg) => {
      console.log(`[BROWSER] ${msg.type()}: ${msg.text()}`);
    });

    // 1. Bypass auth and log in as Dustin
    console.log('Logging in...');
    await page.goto('http://localhost:9002/login');
    await page.evaluate(() => localStorage.clear());
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms');

    // WARMUP: Wait 5 seconds for background user fetching, WebSocket relay, and keysync to stabilize
    console.log('Allowing backend/keysync to warm up...');
    await page.waitForTimeout(5000);

    // ── SCREENSHOT 1: Desktop Compose @ Mention Autocomplete with z-index Stacking Fix ──
    console.log('Triggering Compose Box Autocomplete...');
    const collapsedCompose = page.locator('button:has-text("What do you have to share?")');
    await collapsedCompose.click();
    
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();
    await textarea.focus();
    
    // Type with a slight delay to ensure key events are captured correctly
    await textarea.type('@@bob', { delay: 100 });

    const autocomplete = page.locator('[role="listbox"]');
    await expect(autocomplete).toBeVisible({ timeout: 8000 });

    // Take screenshot of compose box autocomplete
    await page.screenshot({ path: 'tests/screenshots/1-desktop-mention-autocomplete.png' });
    console.log('Saved 1-desktop-mention-autocomplete.png');

    // Close compose box
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ── SCREENSHOT 2: Vibe Picker quick-react Popover ──
    console.log('Navigating to post details...');
    await page.goto('http://localhost:9002/post/ai_post_1/celebrating-our-milestone');
    await page.waitForTimeout(3000); // Wait for post layout and data

    console.log('Triggering Vibe Picker...');
    const vibeBtn = page.locator('button:has(svg.lucide-smile), button:has-text("0")').first();
    await vibeBtn.click();
    await page.waitForTimeout(1000);

    // Take screenshot showing the quick-pick Popover
    await page.screenshot({ path: 'tests/screenshots/2-vibe-picker-popover.png' });
    console.log('Saved 2-vibe-picker-popover.png');

    // Close the popover
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // ── SCREENSHOT 3 & 4: Mobile Comment Dialog & Autocomplete with Optimistic Comment Insertion ──
    console.log('Simulating mobile viewport for comment dialog...');
    await page.setViewportSize({ width: 393, height: 851 });
    await page.waitForTimeout(1000);

    console.log('Opening mobile reply dialog...');
    const replyBtn = page.locator('button:has-text("Reply")').first();
    await replyBtn.click();

    const commentTextarea = page.locator('textarea#comment-content');
    await expect(commentTextarea).toBeVisible({ timeout: 5000 });
    await commentTextarea.focus();
    await commentTextarea.type('@@bob', { delay: 100 });

    // Autocomplete should show up inside the dialog modal
    await expect(autocomplete).toBeVisible({ timeout: 8000 });

    // Take screenshot of mobile dialog autocomplete popover
    await page.screenshot({ path: 'tests/screenshots/3-dialog-autocomplete.png' });
    console.log('Saved 3-dialog-autocomplete.png');

    // Select mention by pressing Enter
    await commentTextarea.press('Enter');
    await page.waitForTimeout(500);

    // Submit the comment
    console.log('Submitting reply...');
    // Target the specific post button in the dialog modal to prevent layout mis-targeting
    const postBtn = page.locator('button:has-text("Post")').last();
    await postBtn.click();
    await page.waitForTimeout(2000);

    // Take screenshot showing the optimistically added comment rendering immediately at the bottom of the list
    await page.screenshot({ path: 'tests/screenshots/4-comment-inserted-optimistically.png' });
    console.log('Saved 4-comment-inserted-optimistically.png');
  });
});
