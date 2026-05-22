import { createAltchaChallenge } from '@/lib/services/altcha-service';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const challenge = await createAltchaChallenge();
    return NextResponse.json(challenge);
  } catch (error) {
    console.error('[altcha-api] Error generating challenge:', error);
    return NextResponse.json(
      { error: 'Failed to generate bot challenge' },
      { status: 500 }
    );
  }
}
