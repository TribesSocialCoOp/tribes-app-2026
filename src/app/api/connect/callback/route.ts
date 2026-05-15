import { NextRequest, NextResponse } from 'next/server';
import { buildUrl } from '@/lib/url';

/**
 * Stripe Connect onboarding callback.
 * After the tribe owner completes Stripe onboarding, they're redirected here.
 * We sync the account status and redirect back to tribe settings.
 */
export async function GET(request: NextRequest) {
  const tribeId = request.nextUrl.searchParams.get('tribeId');
  if (!tribeId) {
    return NextResponse.redirect(buildUrl('/tribes', request));
  }

  try {
    const { syncConnectAccountStatus } = await import('@/lib/services/commerce-service');
    await syncConnectAccountStatus(tribeId);
  } catch (e) {
    console.error('[Connect Callback] Failed to sync account status:', e);
  }

  // Redirect back to tribe settings with success indicator
  // Resolve slug for the new URL pattern
  const { db: appDb } = await import('@/db');
  const { tribes } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const [tribe] = await appDb.select({ slug: tribes.slug }).from(tribes).where(eq(tribes.id, tribeId)).limit(1);
  const slug = tribe?.slug || tribeId;

  return NextResponse.redirect(
    buildUrl(`/t/${slug}/settings?connect=success`, request)
  );
}
