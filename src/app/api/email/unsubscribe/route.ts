/**
 * @fileoverview Email Unsubscribe API Route (P4-2).
 * 
 * GET /api/email/unsubscribe?token=...
 * 
 * Validates the HMAC-signed token and updates the user's
 * notification preferences. Renders a branded confirmation page.
 * No login required — the signed token is the auth.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { notificationPreferences } from '@/db/schema';
import { eq } from 'drizzle-orm';
import {
  validateUnsubscribeToken,
  CATEGORY_LABELS,
  CATEGORY_TO_COLUMN,
  generateUnsubscribeUrl,
  type UnsubscribeCategory,
} from '@/lib/services/email-unsubscribe-service';

const BRAND_COLOR = '#6366f1';

function renderPage(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Tribes.app</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Inter', -apple-system, sans-serif; background: #f4f4f5; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); max-width: 480px; width: 100%; padding: 48px 32px; text-align: center; }
    .brand { font-size: 28px; font-weight: 800; color: ${BRAND_COLOR}; letter-spacing: -0.5px; margin-bottom: 24px; }
    h1 { font-size: 22px; font-weight: 700; color: #18181b; margin-bottom: 12px; }
    p { font-size: 15px; color: #52525b; line-height: 1.6; margin-bottom: 16px; }
    .subtle { font-size: 13px; color: #a1a1aa; }
    a.btn { display: inline-block; padding: 12px 28px; background: ${BRAND_COLOR}; color: #fff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 14px; margin-top: 8px; }
    a.btn:hover { opacity: 0.9; }
    a.link { color: ${BRAND_COLOR}; text-decoration: underline; }
    .divider { height: 1px; background: #e4e4e7; margin: 24px 0; }
  </style>
</head>
<body>
  <div class="card">
    <div class="brand">Tribes.app</div>
    ${body}
  </div>
</body>
</html>`;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    const html = renderPage('Invalid Link', `
      <h1>Invalid Link</h1>
      <p>This unsubscribe link is missing or malformed.</p>
      <a class="btn" href="/">Go to Tribes.app</a>
    `);
    return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html' } });
  }

  const payload = validateUnsubscribeToken(token);

  if (!payload) {
    const html = renderPage('Invalid Link', `
      <h1>Invalid Link</h1>
      <p>This unsubscribe link has expired or is invalid. You can manage your email preferences from your settings page.</p>
      <a class="btn" href="/settings">Go to Settings</a>
    `);
    return new NextResponse(html, { status: 400, headers: { 'Content-Type': 'text/html' } });
  }

  const { userId, category } = payload;
  const categoryLabel = CATEGORY_LABELS[category];
  const columnName = CATEGORY_TO_COLUMN[category];

  try {
    // Upsert the preference
    const [existing] = await db.select().from(notificationPreferences)
      .where(eq(notificationPreferences.userId, userId)).limit(1);

    if (existing) {
      await db.update(notificationPreferences)
        .set({ [columnName]: false, updatedAt: new Date() })
        .where(eq(notificationPreferences.userId, userId));
    } else {
      // Create with defaults, then disable the category
      await db.insert(notificationPreferences).values({
        userId,
        pushEnabled: true,
        emailEnabled: category === 'all' ? false : true,
        mentionsEnabled: true,
        bondMessagesEnabled: category === 'bondMessages' ? false : true,
        tribeActivityEnabled: category === 'tribeActivity' ? false : true,
        eventRemindersEnabled: category === 'eventReminders' ? false : true,
        updatedAt: new Date(),
      });
    }

    // Build the "also disable all" link (only show if not already disabling all)
    let disableAllSection = '';
    if (category !== 'all') {
      const disableAllUrl = generateUnsubscribeUrl(userId, 'all');
      disableAllSection = `
        <div class="divider"></div>
        <p class="subtle">Want to stop all emails?</p>
        <p><a class="link" href="${disableAllUrl}">Unsubscribe from all email notifications</a></p>
      `;
    }

    const html = renderPage('Unsubscribed', `
      <h1>✅ Unsubscribed</h1>
      <p>You've been unsubscribed from <strong>${categoryLabel}</strong>.</p>
      <p class="subtle">You can re-enable these anytime from your settings page.</p>
      <a class="btn" href="/settings">Manage Preferences</a>
      ${disableAllSection}
    `);

    return new NextResponse(html, { status: 200, headers: { 'Content-Type': 'text/html' } });
  } catch (err) {
    console.error('[unsubscribe] Error:', err);
    const html = renderPage('Error', `
      <h1>Something went wrong</h1>
      <p>We couldn't process your unsubscribe request. Please try again or manage your preferences from settings.</p>
      <a class="btn" href="/settings">Go to Settings</a>
    `);
    return new NextResponse(html, { status: 500, headers: { 'Content-Type': 'text/html' } });
  }
}
