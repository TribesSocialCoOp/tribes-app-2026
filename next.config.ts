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
  const s3Endpoint = process.env.S3_ENDPOINT || '';
  const wsRelay = process.env.NEXT_PUBLIC_WS_RELAY_URL || '';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  // Build img-src from known image sources
  const imgSources = ["'self'", 'data:', 'blob:'];
  if (s3Public) imgSources.push(s3Public);
  if (s3Endpoint) imgSources.push(s3Endpoint);

  // Build connect-src for API/WS targets
  const connectSources = ["'self'"];
  if (wsRelay) connectSources.push(wsRelay);
  if (s3Endpoint) connectSources.push(s3Endpoint);
  if (appUrl) connectSources.push(appUrl);

  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",  // Next.js hydration + PoW worker
    "worker-src 'self' blob:",                                  // PoW captcha Web Worker
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')}`,
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
  ];
}

// ============================================================
// Next.js Configuration
// ============================================================

const nextConfig: NextConfig = {
  output: 'standalone',   // Required for Docker multi-stage build (.next/standalone/)
  images: {
    remotePatterns: buildRemotePatterns(),
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
