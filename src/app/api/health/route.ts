/**
 * @fileoverview Health Check Endpoint
 * 
 * GET /api/health
 * 
 * Returns 200 with { status: 'ok' } if the app and database are healthy.
 * Returns 503 with { status: 'error' } if the database is unreachable.
 * 
 * Used by:
 * - Load balancers / reverse proxies for routing decisions
 * - Monitoring systems (Uptime Kuma, etc.)
 * - Container orchestrators for readiness probes
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  try {
    const { db } = await import('@/db');
    const { sql } = await import('drizzle-orm');

    // Verify DB is responsive
    await db.run(sql`SELECT 1`);

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      latencyMs: Date.now() - start,
    });
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        error: (err as Error).message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
