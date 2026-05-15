import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Serve the Apple App Site Association file as application/json.
 * 
 * This explicit route handler is necessary because Next.js standalone mode
 * does not reliably serve extensionless static files from public/.well-known/.
 * iOS requires this file to be served as application/json for:
 *   - webcredentials (Passkey/WebAuthn in WKWebView)
 *   - applinks (Universal Links / Deep Links)
 */
export async function GET() {
  const filePath = path.join(process.cwd(), 'public', '.well-known', 'apple-app-site-association');
  
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
    // Fallback: return the AASA inline if the file is missing
    const aasa = {
      applinks: {
        apps: [],
        details: [
          {
            appID: 'ABXVW6PWCW.app.tribes.TribesApp',
            paths: ['/bond/tap/*', '/bonds/*', '/tribe/*', '/post/*', '/profile/*', '/my-wall', '/events/*', '/signup'],
          },
        ],
      },
      webcredentials: {
        apps: ['ABXVW6PWCW.app.tribes.TribesApp'],
      },
    };
    return NextResponse.json(aasa, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }
}
