import type { NextConfig } from 'next';
import os from 'os';
import path from 'path';

// Get all non-internal local IPv4 addresses to automate allowed origins in dev
function getLocalIPs(): string[] {
  const ips: string[] = [];
  try {
    const interfaces = os.networkInterfaces();
    for (const devName in interfaces) {
      const iface = interfaces[devName];
      if (!iface) continue;
      for (const alias of iface) {
        if (alias.family === 'IPv4' && !alias.internal) {
          ips.push(alias.address);
        }
      }
    }
  } catch (e) {
    // ignore
  }
  return ips;
}

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
  const imgSources = ["'self'", 'data:', 'blob:', 'https://api.qrserver.com'];
  if (s3Public) {
    try {
      const s3Url = new URL(s3Public);
      imgSources.push(s3Url.origin);
    } catch {
      imgSources.push(s3Public);
    }
  }

  // Build connect-src for API/WS targets (public endpoints only)
  const connectSources = ["'self'"];
  if (wsRelay) connectSources.push(wsRelay);
  if (appUrl) connectSources.push(appUrl);
  // Media domain must be in connect-src as well as img-src — fetch() for image
  // download hits connect-src, not img-src (img-src only covers <img> tag loads).
  if (s3Public) {
    try {
      connectSources.push(new URL(s3Public).origin);
    } catch {
      connectSources.push(s3Public);
    }
  }

  // In development, allow connections to any host to support IP-based testing on mobile devices
  if (process.env.NODE_ENV !== 'production') {
    connectSources.push('*');
  }

  const csp = [
    process.env.NODE_ENV === 'production' ? "default-src 'self'" : "default-src 'self' *",
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV !== 'production' ? " 'unsafe-eval'" : ''} blob: https://challenges.cloudflare.com`,
    "worker-src 'self' blob:",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${imgSources.join(' ')}`,
    `connect-src ${connectSources.join(' ')} https://challenges.cloudflare.com`,
    "frame-src https://challenges.cloudflare.com https://open.spotify.com https://w.soundcloud.com https://embed.music.apple.com https://embed.tidal.com https://www.youtube.com https://player.vimeo.com https://bandcamp.com",  // Turnstile + Media Embeds
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
    // Legacy XSS filter for older browsers (Chrome < 78, IE, Safari < 15.4)
    { key: 'X-XSS-Protection', value: '1; mode=block' },
    // Prevent Adobe Flash/Acrobat from loading cross-domain data
    { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
  ];
}

// ============================================================
// Next.js Configuration
// ============================================================

// Build-time fingerprint: unique per deployment
const BUILD_ID = process.env.BUILD_ID || `dev-${Date.now()}`;

const nextConfig: NextConfig = {
  output: 'standalone',   // Required for Docker multi-stage build (.next/standalone/)
  // SECURITY: Suppress X-Powered-By: Next.js header to reduce framework fingerprinting.
  poweredByHeader: false,
  // Dev origins for Capacitor live-reload: read from CAPACITOR_DEV_HOST env var.
  // Also dynamically resolves all active local IPs to prevent connectivity blocks.
  // NOTE: Next.js only uses allowedDevOrigins in dev, but we guard explicitly
  // to avoid running os.networkInterfaces() during production Docker builds.
  allowedDevOrigins: [
    ...(process.env.CAPACITOR_DEV_HOST ? [process.env.CAPACITOR_DEV_HOST] : []),
    ...(process.env.NODE_ENV !== 'production' ? getLocalIPs() : []),
    '10.0.2.2',
    'localhost',
  ],
  // Expose the build ID to the client bundle for version mismatch detection
  env: {
    NEXT_PUBLIC_BUILD_ID: BUILD_ID,
  },
  generateBuildId: () => BUILD_ID,
  images: {
    remotePatterns: buildRemotePatterns(),
  },
  experimental: {
    serverActions: {
      // Safety net: cover images are uploaded via /api/upload (not the action body),
      // so this should never be hit. But if something slips through, fail with a
      // clear 413 rather than a cryptic "Body exceeded 1 MB" trace.
      bodySizeLimit: '20mb',
      // Allow Capacitor WebView origins to call Server Actions during local dev.
      // Without this, Android/iOS WebViews get 403 CSRF errors because their
      // Origin header (the dev machine's LAN IP) doesn't match the Host header.
      ...(process.env.NODE_ENV !== 'production' ? {
        allowedOrigins: [
          'localhost:9002',
          'http://localhost:9002',
          // Android emulator's host-loopback alias
          '10.0.2.2:9002',
          'http://10.0.2.2:9002',
          // Developer's LAN IP for Capacitor live-reload (set CAPACITOR_DEV_HOST in .env.local)
          ...(process.env.CAPACITOR_DEV_HOST ? [
            `${process.env.CAPACITOR_DEV_HOST}:9002`,
            `http://${process.env.CAPACITOR_DEV_HOST}:9002`,
          ] : []),
          // Dynamically resolved local network IPs for hot-reloading & mobile testing
          ...getLocalIPs().flatMap(ip => [
            `${ip}:9002`,
            `http://${ip}:9002`,
          ]),
        ],
      } : {}),
    },
  },
  // Next.js 16 defaults to Turbopack. Pin the workspace root to THIS project
  // dir — otherwise multiple lockfiles under ~/Sites make Turbopack infer the
  // parent ~/Sites as root and recursively watch every sibling project
  // (including cai-hobbes/target, ~26GB of Rust build artifacts), which pegs
  // the CPU at 800%+ and starves the dev server so localhost won't respond.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: buildSecurityHeaders(),
      },
      // Apple App Site Association — required for passkeys (webcredentials)
      // and Universal Links (applinks). Must be served as application/json.
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
        ],
      },
      // Android Digital Asset Links
      {
        source: '/.well-known/assetlinks.json',
        headers: [
          { key: 'Content-Type', value: 'application/json' },
        ],
      },
    ];
  },
  // ── Crypto Module Integrity ─────────────────────────────────
  // Isolate src/lib/crypto/ into a dedicated chunk so its hash
  // can be independently verified against the published source at
  // https://github.com/TribesSocialCoOp/tribes-encryption-audit
  webpack(config, { isServer }) {
    if (!isServer) {
      const existing = config.optimization.splitChunks?.cacheGroups || {};
      config.optimization.splitChunks = {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...existing,
          cryptoCore: {
            test: /src[\\/]lib[\\/]crypto[\\/]/,
            name: 'crypto-core',
            chunks: 'all',
            enforce: true,
            priority: 50,
          },
        },
      };
    }
    return config;
  },
};

export default nextConfig;
