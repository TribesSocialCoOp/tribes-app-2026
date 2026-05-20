import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://tribes:tribes_dev@127.0.0.1:5432/tribes';
const ADMIN_JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ0ZXN0LXNlcnZpY2UtYWRtaW4iLCJzZXNzaW9uSWQiOiJ1YXQtc2Vzc2lvbi1zZGpmb2ciLCJleHBpcmVzIjoiMjAyNi0wNS0yMlQxOToxNjowNi42MzBaIiwiZGVsZXRpb25SZXF1ZXN0ZWRBdCI6bnVsbCwiaWF0IjoxNzc4ODcyNTY2LCJleHAiOjE3Nzk0NzczNjZ9.tJO1zdMBpyn3KsbQQFbpMzRmM5WFmLhZ_HOUAE96ukw';

test('debug tribe page content', async ({ page, context }) => {
  // Inject session cookie
  await context.addCookies([{
    name: 'tribes_session',
    value: ADMIN_JWT,
    domain: 'localhost',
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
  }]);

  await page.goto('http://localhost:9002/t/ai-innovators');
  await page.waitForTimeout(5000); // wait for load
  
  console.log("=== URL ===");
  console.log(page.url());
  
  console.log("=== BODY HTML ===");
  const html = await page.innerHTML('body');
  console.log(html);
});
