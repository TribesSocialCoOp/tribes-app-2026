/**
 * keystore-migration.spec.ts
 *
 * PROVES the tribe-key user-scoping migration is NON-DESTRUCTIVE — i.e. a
 * production browser at the pre-scoping schema (DB v5, tribe keys cached in the
 * legacy `tribe_keys` store keyed by tribeId) upgrades to the new schema (v7)
 * WITHOUT losing any cached key, and with no user action.
 *
 * This is the exact scenario every existing private-tribe member hits on deploy.
 *
 * Method:
 *   1. On a page that does NOT run key-sync (/login), wipe and re-create the
 *      keystore at version 5 with a real AES CryptoKey in the legacy store.
 *   2. Enter the app so the REAL keystore code opens (and upgrades) the DB to v7.
 *   3. Assert the legacy key SURVIVED, the new scoped store exists, and the DB is v7.
 *
 * Run: npx playwright test tests/keystore-migration.spec.ts
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:9002';

test('v5 → v7 tribe-key upgrade preserves cached keys (no data loss, no user action)', async ({ page }) => {
  test.setTimeout(90_000);
  await page.route('**/_next/webpack-hmr**', (r) => r.abort());

  // /login is in the (auth) group — KeySyncProvider (which opens the keystore)
  // is NOT mounted there, so we can seed a clean v5 DB before the app touches it.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });

  // 1. Seed a v5-era keystore with one cached tribe key in the LEGACY store.
  const seededRawLen = await page.evaluate(async () => {
    await new Promise<void>((res) => {
      const del = indexedDB.deleteDatabase('tribes_keystore');
      del.onsuccess = () => res(); del.onerror = () => res(); del.onblocked = () => res();
    });
    const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', key));
    await new Promise<void>((resolve, reject) => {
      const open = indexedDB.open('tribes_keystore', 5);
      open.onupgradeneeded = () => {
        const db = open.result;
        // Re-create just the legacy tribe_keys store with the OLD keyPath.
        if (!db.objectStoreNames.contains('tribe_keys')) {
          db.createObjectStore('tribe_keys', { keyPath: 'tribeId' });
        }
      };
      open.onsuccess = () => {
        const db = open.result;
        const tx = db.transaction('tribe_keys', 'readwrite');
        tx.objectStore('tribe_keys').put({ tribeId: 'mig-test-tribe', key, version: 7, receivedAt: Date.now() });
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);
      };
      open.onerror = () => reject(open.error);
    });
    return raw.length;
  });
  expect(seededRawLen, 'seeded a 256-bit AES key').toBe(32);

  // 2. Enter the app → the real keystore code opens & upgrades the DB to v7.
  // Robust against the dev-login cookie-commit race: the server action sets the
  // session cookie, but the proxy may not see it on the first client nav and
  // bounce back to /login. Retry the click+nav until we actually land
  // authenticated in the (app) shell — only there does KeySyncProvider mount and
  // open the keystore. (The v5 seed lives in IndexedDB, so it survives these navs.)
  await expect(async () => {
    if (page.url().includes('/login')) {
      const btn = page.locator(`button:has-text("Dustin")`);
      await btn.waitFor({ state: 'visible', timeout: 10_000 });
      await btn.click();
      await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 10_000 }).catch(() => {});
    } else {
      await page.goto(`${BASE}/your-comms`, { waitUntil: 'domcontentloaded' });
    }
    expect(page.url(), 'expected to be authenticated, not on /login').not.toContain('/login');
  }).toPass({ timeout: 30_000 });

  // 3. Verify the legacy key SURVIVED the upgrade. KeySyncProvider opens the
  //    keystore on mount and upgrades it; poll until that lands (no fixed sleep).
  const readState = () => page.evaluate(async () => {
    return await new Promise<any>((resolve, reject) => {
      const open = indexedDB.open('tribes_keystore'); // opens at current (upgraded) version
      open.onsuccess = () => {
        const db = open.result;
        const version = db.version;
        const stores = Array.from(db.objectStoreNames);
        if (!db.objectStoreNames.contains('tribe_keys')) {
          db.close(); resolve({ version, stores, hasLegacyKey: false }); return;
        }
        const tx = db.transaction('tribe_keys', 'readonly');
        const g = tx.objectStore('tribe_keys').get('mig-test-tribe');
        g.onsuccess = () => {
          const entry = g.result;
          db.close();
          resolve({ version, stores, hasLegacyKey: !!entry, keyType: entry?.key?.constructor?.name });
        };
        g.onerror = () => { db.close(); resolve({ version, stores, hasLegacyKey: false }); };
      };
      open.onerror = () => reject(open.error);
    });
  });

  await expect.poll(async () => (await readState()).version, {
    message: 'DB upgraded to v7 by KeySyncProvider', timeout: 30_000,
  }).toBe(7);
  const after = await readState();

  expect(after.version, 'DB upgraded to v7').toBe(7);
  expect(after.stores, 'new scoped store added').toContain('tribe_keys_v2');
  expect(after.stores, 'legacy store NOT deleted').toContain('tribe_keys');
  expect(after.hasLegacyKey, 'cached tribe key SURVIVED the upgrade').toBe(true);
  expect(after.keyType, 'survived as a usable CryptoKey').toBe('CryptoKey');
});
