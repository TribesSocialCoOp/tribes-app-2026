import { NextRequest, NextResponse } from 'next/server';

// TEMPORARY diagnostic sink for the chat composer geometry RCA.
// Client posts measurements here; we read them back via GET. Remove after RCA.
let entries: Array<Record<string, unknown>> = [];

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    entries.push(body as Record<string, unknown>);
    if (entries.length > 50) entries = entries.slice(-50);
  } catch {
    // ignore malformed payloads
  }
  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ count: entries.length, entries });
}
