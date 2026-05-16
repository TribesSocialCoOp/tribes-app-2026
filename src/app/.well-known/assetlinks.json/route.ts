import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * Serve the Android Digital Asset Links file as application/json.
 *
 * This explicit route handler is necessary because Next.js standalone mode
 * does not reliably serve static files from public/.well-known/.
 * Android requires this file to be served as application/json for:
 *   - App Links (deep linking / autoVerify intent filters)
 *   - Credential Manager (Passkey/WebAuthn on Android)
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
    // Fallback: return the asset links inline if the file is missing
    const assetlinks = [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'app.tribes.TribesApp',
          sha256_cert_fingerprints: [
            'C3:74:0E:64:03:60:57:DC:D5:B0:BB:3B:BF:A8:2D:81:1C:A1:68:C4:CC:C6:87:BE:8E:6E:5E:8F:2B:0A:B7:5B',
          ],
        },
      },
    ];
    return NextResponse.json(assetlinks, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }
}

