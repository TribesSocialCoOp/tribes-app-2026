import { defineConfig } from '@playwright/test';
import crypto from 'crypto';

const sessionID = crypto.randomUUID();

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
  // Don't auto-start the dev server — assume it's already running
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:9002',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
