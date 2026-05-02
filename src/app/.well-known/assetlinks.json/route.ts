import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Serve the Android Digital Asset Links file as application/json.
 */
export async function GET() {
  const filePath = path.join(process.cwd(), 'public', '.well-known', 'assetlinks.json');
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    return NextResponse.json([], { status: 404 });
  }
}
