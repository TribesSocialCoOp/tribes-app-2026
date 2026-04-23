/**
 * @fileoverview Cron endpoint: purge accounts whose 30-day grace period has expired.
 * 
 * Expected to be called daily by an external scheduler:
 *   0 3 * * * curl -H "Authorization: Bearer $CRON_SECRET" https://tribes.app/api/cron/purge-accounts
 */

import { NextResponse } from 'next/server';

const CRON_SECRET = process.env.CRON_SECRET;

export async function GET(request: Request) {
  // SECURITY: Fail closed — deny ALL requests if CRON_SECRET is not configured.
  // The previous pattern (CRON_SECRET && ...) would silently allow any caller
  // through when the env var was missing.
  const authHeader = request.headers.get('authorization');
  if (!CRON_SECRET || authHeader !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { purgeExpiredAccounts } = await import('@/lib/services/account-deletion-service');
    const purged = await purgeExpiredAccounts();

    return NextResponse.json({
      success: true,
      purged,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cron/purge-accounts] Fatal error:', err);
    return NextResponse.json(
      { error: 'Internal error', details: String(err) },
      { status: 500 },
    );
  }
}
