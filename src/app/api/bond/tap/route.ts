/**
 * POST /api/bond/tap — Creates a new tap token for NFC/QR bond initiation.
 * Phase 2E: Auth-gated API route.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/auth/session';
import { createTapToken } from '@/lib/services/bond-tap-service';
import type { BondType } from '@/lib/types';
import { validateCsrfToken } from '@/lib/auth/csrf';

const VALID_BOND_TYPES: BondType[] = ['person', 'tribe', 'event'];

export async function POST(request: NextRequest) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const csrfToken = request.headers.get('X-CSRF-Token') ?? undefined;
    await validateCsrfToken(csrfToken);

    const body = await request.json();
    const { bondType } = body;

    if (!bondType || !VALID_BOND_TYPES.includes(bondType)) {
      return NextResponse.json(
        { error: 'Invalid bond type', validTypes: VALID_BOND_TYPES },
        { status: 400 },
      );
    }

    const result = await createTapToken(userId, bondType);

    return NextResponse.json({
      token: result.token,
      url: result.url,
      expiresAt: result.expiresAt.toISOString(),
    });
  } catch (err: unknown) {
    console.error('[api/bond/tap] Error:', err);
    return NextResponse.json(
      { error: ((err instanceof Error) ? err.message : 'An error occurred') ?? 'Internal server error' },
      { status: 500 },
    );
  }
}
