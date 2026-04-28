import type { NextRequest } from 'next/server';

/**
 * Build a redirect URL that respects the reverse-proxy's forwarded headers.
 *
 * In production, the Next.js server runs on 0.0.0.0:9002 inside Docker.
 * Caddy terminates TLS and proxies to it. Using `new URL(path, request.url)`
 * would create a redirect to `http://0.0.0.0:9002/...` — wrong.
 *
 * This helper uses x-forwarded-host / x-forwarded-proto (set by Caddy)
 * to reconstruct the correct public origin.
 *
 * Falls back to APP_URL env var, then request.url for local dev.
 */
export function buildUrl(path: string, request: NextRequest | Request): URL {
  const headers = request.headers;
  const forwardedHost = headers.get('x-forwarded-host');
  const forwardedProto = headers.get('x-forwarded-proto') || 'https';

  if (forwardedHost) {
    return new URL(path, `${forwardedProto}://${forwardedHost}`);
  }

  // Fallback: use APP_URL env if set
  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    return new URL(path, appUrl);
  }

  // Local dev fallback
  return new URL(path, request.url);
}

/**
 * Get the base URL from within a Server Action or Server Component.
 * Uses next/headers to inspect forwarded headers.
 */
export async function getBaseUrl(): Promise<string> {
  // Use dynamic import so it doesn't break client-side execution if accidentally imported
  const { headers } = await import('next/headers');
  const headersList = await headers();
  
  const forwardedHost = headersList.get('x-forwarded-host');
  const forwardedProto = headersList.get('x-forwarded-proto') || 'https';

  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  const appUrl = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    return appUrl;
  }

  const host = headersList.get('host');
  if (host) {
    return `http://${host}`;
  }

  return 'http://localhost:9002';
}
