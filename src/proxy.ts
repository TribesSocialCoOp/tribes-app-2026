import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE_NAME, decrypt, encrypt } from '@/lib/auth/session';
import { CSRF_COOKIE_NAME, generateCsrfToken } from '@/lib/auth/csrf';

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
const publicRoutes = ['/login', '/signup', '/'];

function isPublicRoute(pathname: string): boolean {
  // Exact match public routes
  if (publicRoutes.includes(pathname)) return true;
  
  // Public browsing routes (read-only discovery)
  if (pathname.startsWith('/moods')) return true;
  if (pathname.startsWith('/tribes/') && pathname !== '/tribes/create') return true;
  
  // API routes handle their own auth
  if (pathname.startsWith('/api')) return true;
  
  // Static assets and Next.js internals
  if (pathname.startsWith('/_next')) return true;
  if (pathname.match(/\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|woff2?)$/)) return true;
  
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public routes through without session check
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for session cookie
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  
  if (!sessionCookie) {
    // No session — redirect to login with return URL
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    // Verify the JWT and refresh session TTL
    const parsed = await decrypt(sessionCookie);
    
    if (!parsed?.userId) {
      // Invalid session payload — redirect to login
      const loginUrl = new URL('/login', request.url);
      const response = NextResponse.redirect(loginUrl);
      response.cookies.set(SESSION_COOKIE_NAME, '', { expires: new Date(0), path: '/' });
      return response;
    }

    // Check if account is pending deletion — redirect to recovery page
    // Allow settings page so user can cancel deletion
    if (parsed.deletionRequestedAt && pathname !== '/account-recovery' && pathname !== '/settings') {
      return NextResponse.redirect(new URL('/account-recovery', request.url));
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
    const loginUrl = new URL('/login', request.url);
    const response = NextResponse.redirect(loginUrl);
    response.cookies.set(SESSION_COOKIE_NAME, '', { expires: new Date(0), path: '/' });
    return response;
  }
}

// Matcher: run on all routes except static files
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
};
