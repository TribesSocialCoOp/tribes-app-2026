/**
 * @fileoverview Notification click-through handler.
 * 
 * When a user clicks a CTA link in a notification email, the link goes through
 * this route first: /api/notification/click?to=/tribes/abc123&post=p1
 * 
 * The route:
 *   1. Stamps lastActivityViewedAt for the current user (marks notifications as read)
 *   2. Redirects to the target URL
 * 
 * If the user is not authenticated, it redirects directly without marking.
 */

import { NextRequest, NextResponse } from 'next/server';

import { buildUrl } from '@/lib/url';

export async function GET(req: NextRequest) {
  const targetPath = req.nextUrl.searchParams.get('to') || '/activity';

  // Build the full redirect URL (relative to origin)
  const redirectUrl = buildUrl(targetPath, req);

  try {
    // Try to get the current user and mark their activity as viewed
    const { getCurrentUserId } = await import('@/lib/actions/shared');
    const userId = await getCurrentUserId();

    if (userId) {
      const { markActivityViewed } = await import('@/lib/services/notification-service');
      await markActivityViewed(userId);
    }
  } catch {
    // If auth fails (user not logged in), just redirect — they'll need to sign in first
  }

  return NextResponse.redirect(redirectUrl, 302);
}
