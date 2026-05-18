import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, decrypt, encrypt } from '@/lib/auth/session';
import { CSRF_COOKIE_NAME, generateCsrfToken } from '@/lib/auth/csrf';
import { buildUrl } from '@/lib/url';

/**
 * Phase 1A: Route Protection Proxy
 * 
 * Next.js 15 uses proxy.ts instead of middleware.ts.
 * 
 * - Verifies JWT session cookie on protected routes
 * - Redirects unauthenticated users to /login with returnTo param
 * - Auto-refreshes session TTL on each request (sliding 7-day window)
 * - Allows passthrough for public routes, static assets, and API auth routes
 */

// Routes that don't require authentication
const publicRoutes = ['/login', '/signup', '/', '/terms', '/privacy', '/cookies', '/community-guidelines'];

function isPublicRoute(pathname: string): boolean {
  // Exact match public routes
  if (publicRoutes.includes(pathname)) return true;
  
  // Public browsing routes (read-only discovery)
  if (pathname.startsWith('/moods')) return true;
  if (pathname.startsWith('/post/')) return true;
  if (pathname.startsWith('/t/')) return true;  // New slug-based tribe routes
  if (pathname.startsWith('/u/')) return true;  // New slug-based profile routes
  if (pathname.startsWith('/e/')) return true;  // New slug-based event routes
  if (pathname.startsWith('/vote/')) return true;  // New slug-based voting routes
  if ((pathname === '/tribes' || pathname.startsWith('/tribes/')) && pathname !== '/tribes/create') return true;
  
  // API routes handle their own auth
  if (pathname.startsWith('/api')) return true;
  
  // Static assets and Next.js internals
  if (pathname.startsWith('/_next')) return true;
  if (pathname.startsWith('/.well-known')) return true;
  if (pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|woff2?)$/)) return true;
  
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Legacy voting URL redirect: /voting/[proposalId] → /api/resolve-proposal/[proposalId] ──
  const legacyProposalMatch = pathname.match(/^\/voting\/(prop[a-zA-Z0-9_-]+)$/);
  if (legacyProposalMatch) {
    const proposalId = legacyProposalMatch[1];
    const resolveUrl = buildUrl(`/api/resolve-proposal/${proposalId}`, request);
    return NextResponse.rewrite(resolveUrl);
  }

  // ── Legacy event URL redirect: /events/[eventId] → /api/resolve-event/[eventId] ──
  const legacyEventMatch = pathname.match(/^\/events\/(event[a-zA-Z0-9_-]+)$/);
  if (legacyEventMatch) {
    const eventId = legacyEventMatch[1];
    const resolveUrl = buildUrl(`/api/resolve-event/${eventId}`, request);
    return NextResponse.rewrite(resolveUrl);
  }

  // ── Legacy profile URL redirect: /profile/[userId] → /api/resolve-profile/[userId] ──
  const legacyProfileMatch = pathname.match(/^\/profile\/([a-zA-Z0-9_-]+)$/);
  if (legacyProfileMatch) {
    const userId = legacyProfileMatch[1];
    const resolveUrl = buildUrl(`/api/resolve-profile/${userId}`, request);
    return NextResponse.rewrite(resolveUrl);
  }

  // ── Legacy tribe URL redirect: /tribes/tribe-XXXX → /api/resolve-tribe/tribe-XXXX ──
  const legacyTribeMatch = pathname.match(/^\/tribes\/(tribe-\d+)(\/.*)?$/);
  if (legacyTribeMatch) {
    const tribeId = legacyTribeMatch[1];
    const suffix = legacyTribeMatch[2] || '';
    const resolveUrl = buildUrl(`/api/resolve-tribe/${tribeId}${suffix}`, request);
    return NextResponse.rewrite(resolveUrl);
  }

  // Allow public routes through without session check
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionCookie) {
    // No session — redirect to login with return URL
    const loginUrl = buildUrl('/login', request);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Verify the JWT and refresh session TTL
    const parsed = await decrypt(sessionCookie);
    
    if (!parsed?.userId || !parsed?.sessionId) {
      // Invalid session payload — redirect to login
      const loginUrl = buildUrl('/login', request);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set(SESSION_COOKIE_NAME, '', { expires: new Date(0), path: '/' });
      return response;
    }

    // SECURITY: Validate session via internal HTTP endpoint (edge-ready).
    // Uses fetch() instead of direct DB import so this works on any runtime.
    const checkUrl = buildUrl(`/api/internal/session-check?sessionId=${parsed.sessionId}`, request);
    const internalSecret = process.env.INTERNAL_API_SECRET;
    
    if (internalSecret) {
      const res = await fetch(checkUrl.toString(), {
        headers: { Authorization: `Bearer ${internalSecret}` },
        // Use a short timeout to prevent hanging the proxy
        signal: AbortSignal.timeout(2000),
      });

      if (!res.ok) {
        throw new Error(`Session check failed: ${res.status}`);
      }

      const { valid } = await res.json();
      if (!valid) {
        // Session revoked or expired in DB — clear cookie and redirect
        const loginUrl = buildUrl('/login', request);
        const response = NextResponse.redirect(loginUrl);
        response.cookies.set(SESSION_COOKIE_NAME, '', { expires: new Date(0), path: '/' });
        return response;
      }
    } else {
      console.warn('[proxy] INTERNAL_API_SECRET not set, skipping DB session revocation check');
    }

    // Check if account is pending deletion — redirect to recovery page
    // Allow settings page so user can cancel deletion
    if (parsed.deletionRequestedAt && pathname !== '/account-recovery' && pathname !== '/settings') {
      return NextResponse.redirect(buildUrl('/account-recovery', request));
    }

    // Refresh the session TTL (sliding window)
    const newExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    parsed.expires = newExpires;
    
    const response = NextResponse.next();
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: await encrypt(parsed),
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      expires: newExpires,
      path: '/',
    });

    // Inject CSRF cookie if not already present
    if (!request.cookies.get(CSRF_COOKIE_NAME)?.value) {
      response.cookies.set({
        name: CSRF_COOKIE_NAME,
        value: generateCsrfToken(),
        httpOnly: false,       // JS must read this
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',    // Block cross-site reads
        path: '/',
        // No expires — session cookie, cleared on browser close
      });
    }
    
    return response;
  } catch (error) {
    // JWT verification failed (expired, tampered, etc.)
    console.error('[proxy] Session verification failed:', error);
    const loginUrl = buildUrl('/login', request);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(SESSION_COOKIE_NAME, '', { expires: new Date(0), path: '/' });
    return response;
  }
}

// Matcher: run on all routes except static files
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
