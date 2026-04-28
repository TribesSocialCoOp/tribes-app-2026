import type {NextConfig} from 'next';

// ============================================================
// Environment-driven image host patterns (replaces hardcoded IPs)
// ============================================================

function buildRemotePatterns() {
  const patterns: { protocol: 'http' | 'https'; hostname: string; port?: string; pathname: string }[] = [];
  const seen = new Set<string>();

  for (const envVar of ['S3_PUBLIC_ENDPOINT', 'S3_ENDPOINT']) {
    const raw = process.env[envVar];
    if (!raw) continue;
    try {
      const url = new URL(raw);
      const key = `${url.protocol}//${url.hostname}:${url.port}`;
      if (seen.has(key)) continue;
      seen.add(key);
      patterns.push({
        protocol: url.protocol.replace(':', '') as 'http' | 'https',
        hostname: url.hostname,
        port: url.port || undefined,
        pathname: '/**',
      });
    } catch {
      /* skip malformed URLs */
    }
  }

  // Dev fallback — only if nothing was parsed from env
  if (patterns.length === 0) {
    patterns.push(
      { protocol: 'http', hostname: 'localhost', port: '8888', pathname: '/**' },
      { protocol: 'http', hostname: 'localhost', port: '8333', pathname: '/**' },
    );
  }

  return patterns;
}

// ============================================================
// Security headers (CSP, X-Frame-Options, etc.)
// ============================================================

function buildSecurityHeaders() {
  const s3Public = process.env.S3_PUBLIC_ENDPOINT || '';
  // NOTE: S3_ENDPOINT is intentionally NOT included here — it contains an
  // internal Docker hostname (seaweedfs-filer:8333) that must not be exposed
  // to browsers via CSP headers (information disclosure).
  const wsRelay = process.env.NEXT_PUBLIC_WS_RELAY_URL || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  // Build img-src from known PUBLIC image sources only
  const imgSources = ["'self'", 'data:', 'blob:'];
  if (s3Public) imgSources.push(s3Public);

  // Build connect-src for API/WS targets (public endpoints only)
  const connectSources = ["'self'"];
  if (wsRelay) connectSources.push(wsRelay);
  if (appUrl) connectSources.push(appUrl);

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''} blob: https://challenges.cloudflare.com`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')} https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com",  // Turnstile renders inside an iframe
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');

  return [
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-DNS-Prefetch-Control', value: 'on' },
    { key: 'Content-Security-Policy', value: csp },
    // Allow Turnstile iframe to access the features it needs for bot detection
    { key: 'Permissions-Policy', value: 'xr-spatial-tracking=()' },
  ];
}

// ============================================================
// Next.js Configuration
// ============================================================

const nextConfig: NextConfig = {
  output: 'standalone',   // Required for Docker multi-stage build (.next/standalone/)
  // SECURITY: Suppress X-Powered-By: Next.js header to reduce framework fingerprinting.
  poweredByHeader: false,
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  experimental: {
    serverActions: {
      // Safety net: cover images are uploaded via /api/upload (not the action body),
      // so this should never be hit. But if something slips through, fail with a
      // clear 413 rather than a cryptic "Body exceeded 1 MB" trace.
      bodySizeLimit: '4mb',
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
      },
    ];
  },
};

export default nextConfig;
