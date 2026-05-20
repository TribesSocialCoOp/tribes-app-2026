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
        relation: [
          'delegate_permission/common.handle_all_urls',
          'delegate_permission/common.get_login_creds'
        ],
        target: {
          namespace: 'android_app',
          package_name: 'app.tribes.android',
          sha256_cert_fingerprints: [
            'C3:74:0E:64:03:60:57:DC:D5:B0:BB:3B:BF:A8:2D:81:1C:A1:68:C4:CC:C6:87:BE:8E:6E:5E:8F:2B:0A:B7:5B',
            'AB:34:41:9E:0D:C6:29:61:34:17:BB:EC:56:72:D8:80:04:DD:10:08:51:9E:C4:78:00:5B:9D:4A:00:1C:4E:85',
            'B6:B0:96:5C:BC:6F:15:D9:24:09:09:7E:36:9D:38:46:51:F4:43:7D:D1:71:E3:5D:63:65:AB:16:69:B4:49:EA'
          ],
        },
      },
    ];
    return NextResponse.json(assetlinks, {
      headers: { 'Cache-Control': 'public, max-age=3600' },
    });
  }
}

