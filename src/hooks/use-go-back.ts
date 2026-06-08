'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Deterministic parent route map.
 * Retained as a reference for the logical navigation hierarchy.
 * Previously used as a Capacitor fallback (window.location.assign) because
 * the old approach wiped pushState history. Now that both web and Capacitor
 * use the sentinel + history.back() approach, this map is no longer needed
 * for back navigation.
 */
const PARENT_ROUTES: Array<{
  pattern: RegExp;
  parent: string | ((m: RegExpMatchArray) => string);
}> = [
  // Post detail under tribe slug → tribe
  { pattern: /^\/t\/([^/]+)\/post\//, parent: (m) => `/t/${m[1]}` },
  // Post detail under /post/ → feed
  { pattern: /^\/post\//, parent: '/your-comms' },
  // Bond detail → bonds list
  { pattern: /^\/bonds\//, parent: '/bonds' },
  // Story detail → stories
  { pattern: /^\/our-story\//, parent: '/our-story' },
  // Tribe sub-pages → tribe detail (settings, manage-members, analytics, mod-queue)
  { pattern: /^\/(?:tribes\/([^/]+)|t\/([^/]+))\/.+$/, parent: (m) => m[2] ? `/t/${m[2]}` : `/tribes/${m[1]}` },
  // Tribe detail → feed (not /tribes list — user likely came from a post or feed)
  { pattern: /^\/(?:tribes\/[^/]+|t\/[^/]+)$/, parent: '/your-comms' },
  // Profile → feed
  { pattern: /^\/(?:profile|u|p)\//, parent: '/your-comms' },
  // Event → feed
  { pattern: /^\/(?:events|e)\//, parent: '/your-comms' },
  // Voting detail → voting
  { pattern: /^\/(?:voting|vote)\//, parent: '/voting' },
  // Creator analytics → feed
  { pattern: /^\/creator-analytics/, parent: '/your-comms' },
  // Admin → feed
  { pattern: /^\/admin\//, parent: '/your-comms' },
];

/**
 * Get the deterministic parent route for a given pathname.
 * Used by the useGoBack hook as a Capacitor fallback.
 */
export function getParentRoute(pathname: string): string {
  for (const { pattern, parent } of PARENT_ROUTES) {
    const match = pathname.match(pattern);
    if (match) return typeof parent === 'function' ? parent(match) : parent;
  }
  return '/your-comms'; // Ultimate fallback
}

/**
 * Unified back navigation hook.
 *
 * Uses router.back() on ALL platforms (web + Capacitor). The sentinel
 * injected by layout.tsx guarantees /your-comms is always at the bottom
 * of the history stack, so router.back() is safe everywhere.
 *
 * The sentinel guard prevents navigating past the bottom of in-app
 * history (e.g. from an in-app back button on the first screen).
 */
export function useGoBack() {
  const router = useRouter();

  return useCallback(() => {
    (window as any).__navTrace?.recordGoBack(
      window.location.pathname,
      window.history.state,
      window.history.length,
    );
    // If we're on the sentinel entry, there's nowhere to go back to
    if (window.history.state?._tribesSentinel) {
      return;
    }
    router.back();
  }, [router]);
}

