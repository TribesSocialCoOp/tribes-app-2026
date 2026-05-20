import { NextRequest, NextResponse } from 'next/server';
import { getClientIp, nciiStatusLimiter } from '@/lib/auth/rate-limit';
import { getNciiReportStatus } from '@/lib/services/ncii-service';

export async function GET(request: NextRequest) {
  try {
    const ip = getClientIp(request.headers);
    
    // 1. Rate Limiting
    try {
      await nciiStatusLimiter.check(ip);
    } catch (limitErr: any) {
      return NextResponse.json({ error: limitErr.message }, { status: 429 });
    }

    // 2. Query Parameters
    const { searchParams } = new URL(request.url);
    const tracking = searchParams.get('tracking')?.trim();
    const email = searchParams.get('email')?.trim();

    if (!tracking || !email) {
      return NextResponse.json({ error: 'Both tracking number and email address are required.' }, { status: 400 });
    }

    // 3. Lookup via Service
    const statusInfo = await getNciiReportStatus(tracking, email);
    if (!statusInfo) {
      return NextResponse.json({ error: 'No report found with the matching tracking number and email address.' }, { status: 404 });
    }

    return NextResponse.json(statusInfo);
  } catch (err: unknown) {
    console.error('[api/ncii/status] Error:', err);
    return NextResponse.json({
      error: 'An unexpected error occurred during status lookup. Please try again later.',
    }, { status: 500 });
  }
}
