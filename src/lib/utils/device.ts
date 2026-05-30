/**
 * @fileoverview Shared device/browser detection from User-Agent strings.
 *
 * Used by:
 * - key-sync-provider.tsx (Phase 0.5 device registration label)
 * - sessions-section.tsx (device display in settings UI)
 *
 * Consolidates UA parsing into a single source of truth so browser/OS
 * detection logic doesn't drift between components.
 */

// ============================================================
// TYPES
// ============================================================

export interface ParsedDevice {
  /** Human-readable label, e.g. "Chrome on macOS", "Safari on iOS" */
  label: string;
  /** Detected browser name */
  browser: string;
  /** Detected OS name (empty string if unknown) */
  os: string;
  /** Whether this is a mobile device */
  isMobile: boolean;
}

// ============================================================
// PARSER
// ============================================================

/**
 * Parses a User-Agent string into a structured device descriptor.
 *
 * Detection order matters for browsers because many include each other's
 * tokens (e.g. Edge includes "Chrome", Chrome includes "Safari").
 * Samsung Internet must be checked before Chrome; Edge before Chrome;
 * Safari must exclude Chrome.
 *
 * @param ua - Raw User-Agent string (or null/undefined for SSR)
 * @returns Parsed device info with label, browser, OS, and mobile flag
 */
export function parseDeviceUA(ua?: string | null): ParsedDevice {
  if (!ua) {
    return { label: 'Unknown Device', browser: 'Browser', os: '', isMobile: false };
  }

  // ── Browser detection ──
  let browser = 'Browser';
  if (ua.includes('SamsungBrowser')) browser = 'Samsung Internet';
  else if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('OPR/') || ua.includes('Opera')) browser = 'Opera';
  else if (ua.includes('Chrome') && !ua.includes('Edg/')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';

  // ── OS detection ──
  let os = '';
  if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('Mac OS X') || ua.includes('Macintosh')) os = 'macOS';
  else if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Linux') && !ua.includes('Android')) os = 'Linux';
  else if (ua.includes('CrOS')) os = 'ChromeOS';

  // ── Mobile detection ──
  const isMobile = os === 'iOS' || os === 'Android' ||
    /mobile/i.test(ua);

  const label = os ? `${browser} on ${os}` : browser;

  return { label, browser, os, isMobile };
}

/**
 * Convenience: returns the device label for the current browser.
 * Safe to call during SSR (returns "Unknown Device").
 */
export function detectCurrentDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown Device';
  return parseDeviceUA(navigator.userAgent).label;
}
