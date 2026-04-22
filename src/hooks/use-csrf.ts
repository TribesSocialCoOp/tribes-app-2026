'use client';

/**
 * React hook to read the CSRF token from the cookie.
 * The cookie is NOT httpOnly, so JS can read it.
 */
export function useCsrf(): string {
  if (typeof document === 'undefined') return '';

  const match = document.cookie.match(/(?:^|;\s*)__tribes_csrf=([^;]*)/);
  return match?.[1] ?? '';
}
