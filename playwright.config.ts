import { defineConfig, devices } from '@playwright/test';
import crypto from 'crypto';
import fs from 'fs';

const sessionID = crypto.randomUUID();

const defaultBravePath = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const bravePath = process.env.BRAVE_PATH || defaultBravePath;
const hasBrave = fs.existsSync(bravePath);

const projects = [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] },
  },
];

if (hasBrave) {
  console.log(`[playwright] Local Brave browser detected at: ${bravePath}. Adding to E2E test projects.`);
  projects.push({
    name: 'brave',
    use: {
      ...devices['Desktop Chrome'],
      executablePath: bravePath,
    },
  });
} else {
  console.log('[playwright] Local Brave browser not detected. Skipping Brave E2E project (Chromium only).');
}

// Firefox coverage for the ALTCHA-on-Firefox triage (#altcha-firefox-report).
// Three variants to bracket the likely culprits: plain default profile (control),
// Strict Enhanced Tracking Protection (blocks known fingerprinting/tracker scripts),
// and an auto-started Private Browsing window (Strict ETP is on by default there too).
projects.push(
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] },
  },
  {
    name: 'firefox-strict-etp',
    use: {
      ...devices['Desktop Firefox'],
      launchOptions: {
        firefoxUserPrefs: {
          'browser.contentblocking.category': 'strict',
          'privacy.trackingprotection.enabled': true,
          'privacy.trackingprotection.socialtracking.enabled': true,
          'privacy.trackingprotection.cryptomining.enabled': true,
          'privacy.trackingprotection.fingerprinting.enabled': true,
        },
      },
    },
  },
  {
    name: 'firefox-private',
    use: {
      ...devices['Desktop Firefox'],
      launchOptions: {
        firefoxUserPrefs: {
          'browser.privatebrowsing.autostart': true,
        },
      },
    },
  },
);

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:9002',
    trace: 'on-first-retry',
    headless: true,
    extraHTTPHeaders: {
      'x-e2e-test-session': sessionID,
    },
  },
  projects,
  // Don't auto-start the dev server — assume it's already running
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:9002',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
