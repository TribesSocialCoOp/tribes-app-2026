import { test, expect } from '@playwright/test';

test('diagnose scroll jump on dialog open in Capacitor layout', async ({ page }) => {
  // Simulate mobile viewport
  await page.setViewportSize({ width: 393, height: 851 });

  // Step 1: Login via the dev user buttons
  await page.goto('http://localhost:9002/login');
  await page.waitForTimeout(2000);

  // Click the "Test Member" dev login button (the one with 🔬)
  const memberBtn = page.locator('button:has-text("Test Member")');
  await memberBtn.waitFor({ state: 'visible', timeout: 5000 });
  console.log('=== Clicking Test Member dev login ===');
  await memberBtn.click();

  // Wait for navigation — use waitForURL with networkidle or detect data-app-ready
  await page.waitForURL('**/your-comms', { timeout: 15000, waitUntil: 'domcontentloaded' }).catch(async () => {
    // Fallback: dev login might use router.push which doesn't always trigger load
    await page.waitForTimeout(5000);
  });
  console.log('=== Logged in, now on:', page.url(), '===');
  await page.waitForTimeout(1000);

  // Register console listener IMMEDIATELY so we catch guard mount and scroll events
  const consoleLogs: string[] = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[SCROLL-SPY]') || text.includes('[BODY-SPY]') || text.includes('[OverlayScrollGuard]') || text.includes('[ScrollGuard]')) {
      consoleLogs.push(text);
    }
  });

  // Step 2: Navigate to tribe page
  await page.goto('http://localhost:9002/t/ai-innovators');
  await page.waitForTimeout(3000);

  // Step 3: Simulate Capacitor environment
  await page.evaluate(() => {
    document.documentElement.classList.add('capacitor-native');
  });
  await page.waitForTimeout(500);

  // Verify we have the right scroll container setup
  const layoutInfo = await page.evaluate(() => {
    const main = document.querySelector('main[data-app-ready]') as HTMLElement;
    if (!main) return { error: 'no main[data-app-ready] found' };
    const bodyStyle = window.getComputedStyle(document.body);
    return {
      mainExists: true,
      mainScrollHeight: main.scrollHeight,
      mainClientHeight: main.clientHeight,
      bodyPosition: bodyStyle.position,
      bodyOverflow: bodyStyle.overflow,
    };
  });
  console.log('=== LAYOUT ===', layoutInfo);

  // Step 4: Install monitoring
  await page.evaluate(() => {
    const main = document.querySelector('main[data-app-ready]') as HTMLElement;
    if (!main) return;

    let lastScrollTop = main.scrollTop;
    main.addEventListener('scroll', () => {
      const newVal = main.scrollTop;
      if (Math.abs(newVal - lastScrollTop) > 50) {
        console.log(`[SCROLL-SPY] main.scrollTop jumped: ${lastScrollTop} → ${newVal} (Δ${newVal - lastScrollTop})`);
      }
      lastScrollTop = newVal;
    }, { passive: true });

    // Watch body attribute changes
    const bodyObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'style' || m.attributeName === 'data-scroll-locked') {
          console.log(`[BODY-SPY] body.${m.attributeName} changed → ${
            m.attributeName === 'style' ? document.body.style.cssText.slice(0, 100) : document.body.getAttribute(m.attributeName)
          } | main.scrollTop=${main.scrollTop}`);
        }
      }
    });
    bodyObserver.observe(document.body, { attributes: true });
  });

  // Step 5: Scroll main container down to comments area
  await page.evaluate(() => {
    const main = document.querySelector('main[data-app-ready]') as HTMLElement;
    if (main) {
      main.scrollTop = main.scrollHeight * 0.6;
      main.dispatchEvent(new Event('scroll', { bubbles: true }));
    }
  });
  await page.waitForTimeout(1000);

  // Verify the guard captured the position by reading scrollTop
  const beforeScrollTop = await page.evaluate(() => {
    const main = document.querySelector('main[data-app-ready]') as HTMLElement;
    return main?.scrollTop ?? -1;
  });
  console.log(`\n=== BEFORE: main.scrollTop = ${beforeScrollTop} ===`);
  await page.screenshot({ path: 'test-results/scroll_before.png' });

  // Step 6: Find and click a Reply button (user is now logged in as member)
  const replyBtns = page.locator('button:has-text("Reply")');
  const count = await replyBtns.count();
  console.log(`Found ${count} Reply buttons`);

  let clicked = false;
  if (count > 0) {
    for (let i = 0; i < count; i++) {
      const btn = replyBtns.nth(i);
      if (await btn.isVisible()) {
        console.log(`Clicking Reply button #${i}`);
        await btn.click();
        clicked = true;
        break;
      }
    }
  }

  if (!clicked) {
    // Fallback: try MoreVertical menu
    const moreBtns = page.locator('button:has(svg.lucide-more-vertical)');
    const moreCount = await moreBtns.count();
    console.log(`No visible Reply. Found ${moreCount} MoreVertical buttons`);
    for (let i = 0; i < moreCount; i++) {
      if (await moreBtns.nth(i).isVisible()) {
        console.log(`Clicking MoreVertical #${i}`);
        await moreBtns.nth(i).click();
        clicked = true;
        break;
      }
    }
  }

  if (!clicked) {
    console.log('=== COULD NOT FIND ANY TRIGGER BUTTON ===');
    // Dump visible buttons for debugging
    const allBtns = await page.evaluate(() => {
      const main = document.querySelector('main[data-app-ready]') as HTMLElement;
      const btns = main?.querySelectorAll('button') || [];
      return Array.from(btns).slice(0, 20).map(b => ({
        text: b.textContent?.trim().slice(0, 50),
        visible: b.offsetParent !== null,
      }));
    });
    console.log('Visible buttons:', JSON.stringify(allBtns, null, 2));
  }

  await page.waitForTimeout(2000); // Wait for dialog/sheet animation

  // Step 7: Measure scroll position AFTER dialog opened
  const afterScrollTop = await page.evaluate(() => {
    const main = document.querySelector('main[data-app-ready]') as HTMLElement;
    return main?.scrollTop ?? -1;
  });
  console.log(`=== AFTER: main.scrollTop = ${afterScrollTop} ===`);
  console.log(`=== DELTA: ${beforeScrollTop - afterScrollTop}px ===\n`);
  await page.screenshot({ path: 'test-results/scroll_after.png' });

  // Step 8: Check what state the overlay/dialog is in
  const overlayState = await page.evaluate(() => ({
    hasDataStateOpen: !!document.querySelector('[data-state="open"]'),
    hasVaulDrawer: !!document.querySelector('[data-vaul-drawer]'),
    hasScrollLocked: document.body.hasAttribute('data-scroll-locked'),
    bodyStyle: document.body.style.cssText.slice(0, 200),
    dataScrollLockedValue: document.body.getAttribute('data-scroll-locked'),
  }));
  console.log('=== OVERLAY STATE ===', overlayState);

  // Print all captured spy logs
  console.log('\n=== SPY LOGS ===');
  for (const log of consoleLogs) {
    console.log('  ', log);
  }
  console.log('=== END SPY LOGS ===\n');

  // Determine result
  const delta = Math.abs(beforeScrollTop - afterScrollTop);
  if (delta > 5) {
    console.log(`>>> BUG PRESENT: scroll jumped by ${delta}px <<<`);
  } else {
    console.log('>>> SCROLL PRESERVED: no jump detected <<<');
  }
});
