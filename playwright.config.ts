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
