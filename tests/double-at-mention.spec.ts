import { test, expect } from '@playwright/test';

test.describe('Double @@ Mentions Autocomplete', () => {
  test('should trigger autocomplete on @@ and clean double-@ into single @alias on selection', async ({ page }) => {
    // 1. Log browser console messages to the test runner terminal
    page.on('console', (msg) => {
      console.log(`[BROWSER CONSOLE] ${msg.type()}: ${msg.text()}`);
    });

    // 2. Go to login and bypass
    await page.goto('http://localhost:9002/login');
    await page.evaluate(() => localStorage.clear());
    await page.click('button:has-text("Dustin")');
    await page.waitForURL('**/your-comms');

    // 3. Expand the compose box
    const collapsedBtn = page.locator('button:has-text("What do you have to share?")');
    await collapsedBtn.click();
    
    const textarea = page.locator('textarea');
    await expect(textarea).toBeVisible();

    // 4. Focus the textarea and type '@@bob' to trigger autocomplete for Bob Builder
    await textarea.focus();
    await textarea.type('@@bob');

    // 5. Verify autocomplete popover is visible and contains Bob Builder
    const autocompletePopover = page.locator('[role="listbox"]');
    await expect(autocompletePopover).toBeVisible({ timeout: 5000 });
    
    const bobOption = page.locator('li:has-text("Bob Builder")');
    await expect(bobOption).toBeVisible();

    // Take screenshot showing the popup triggered on double-@
    await page.screenshot({ path: 'double-at-popup.png' });
    console.log('Saved screenshot of double @ autocomplete popup to double-at-popup.png');

    // 6. Press Enter to select the user
    await textarea.press('Enter');

    // 7. Verify the autocomplete is closed
    await expect(autocompletePopover).not.toBeVisible();

    // 8. Verify the text is cleaned up to exactly '@Bob-Builder ' (or Bob's alias, let's fetch the actual value)
    const val = await textarea.inputValue();
    console.log(`Textarea content after selection: "${val}"`);
    
    // Check that we only have ONE leading '@', not two, and it inserted correctly!
    expect(val).toMatch(/^@bob-builder\s$/i);

    // Take screenshot showing the successfully cleaned insertion
    await page.screenshot({ path: 'double-at-success.png' });
    console.log('Saved screenshot of double @ insertion success to double-at-success.png');
  });
});
