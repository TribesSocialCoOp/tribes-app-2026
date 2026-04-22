/**
 * @fileoverview Generates inline SVG data-URIs for default cover images.
 * 
 * Replaces external placehold.co dependency with locally-generated,
 * branded placeholder images. Inspired by Digg's minimalist community
 * design — clean backgrounds with geometric patterns and topic initials.
 * 
 * All SVGs are business-safe: no external dependencies, no network calls,
 * and render instantly without layout shift.
 */

/** Color palette for placeholder backgrounds — curated harmonious pastels */
const PALETTE = [
  { bg: '#6366F1', fg: '#E0E7FF' },  // Indigo
  { bg: '#8B5CF6', fg: '#EDE9FE' },  // Violet
  { bg: '#EC4899', fg: '#FCE7F3' },  // Pink
  { bg: '#F59E0B', fg: '#FEF3C7' },  // Amber
  { bg: '#10B981', fg: '#D1FAE5' },  // Emerald
  { bg: '#3B82F6', fg: '#DBEAFE' },  // Blue
  { bg: '#EF4444', fg: '#FEE2E2' },  // Red
  { bg: '#14B8A6', fg: '#CCFBF1' },  // Teal
  { bg: '#F97316', fg: '#FFEDD5' },  // Orange
  { bg: '#06B6D4', fg: '#CFFAFE' },  // Cyan
] as const;

/** Deterministic color selection based on name hash */
function getColorPair(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

/** Extract up to 2-character initials from a name */
function getInitials(name: string): string {
  return name
    .split(/[\s-_]+/)
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

/**
 * Generates a tribe cover image as an inline SVG data-URI.
 * 400x200 with geometric accents, initials, and subtle grid pattern.
 */
export function tribeCoverSvg(tribeName: string): string {
  const { bg, fg } = getColorPair(tribeName);
  const initials = getInitials(tribeName);
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
    <defs>
      <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
        <path d="M 40 0 L 0 0 0 40" fill="none" stroke="${fg}" stroke-width="0.5" opacity="0.3"/>
      </pattern>
    </defs>
    <rect width="400" height="200" fill="${bg}"/>
    <rect width="400" height="200" fill="url(#grid)"/>
    <circle cx="320" cy="40" r="60" fill="${fg}" opacity="0.15"/>
    <circle cx="80" cy="160" r="40" fill="${fg}" opacity="0.1"/>
    <text x="200" y="108" font-family="system-ui,-apple-system,sans-serif" font-size="48" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">${escapeXml(initials)}</text>
    <text x="200" y="150" font-family="system-ui,-apple-system,sans-serif" font-size="12" fill="${fg}" text-anchor="middle" opacity="0.6">${escapeXml(tribeName.substring(0, 30))}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Generates an event cover image as an inline SVG data-URI.
 * 1200x400 with diagonal accent stripe.
 */
export function eventCoverSvg(eventName: string): string {
  const { bg, fg } = getColorPair(eventName);
  const initials = getInitials(eventName);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="400" viewBox="0 0 1200 400">
    <defs>
      <pattern id="dots" width="30" height="30" patternUnits="userSpaceOnUse">
        <circle cx="15" cy="15" r="1.5" fill="${fg}" opacity="0.2"/>
      </pattern>
    </defs>
    <rect width="1200" height="400" fill="${bg}"/>
    <rect width="1200" height="400" fill="url(#dots)"/>
    <polygon points="0,400 400,0 500,0 100,400" fill="${fg}" opacity="0.08"/>
    <polygon points="600,400 1000,0 1100,0 700,400" fill="${fg}" opacity="0.06"/>
    <text x="600" y="190" font-family="system-ui,-apple-system,sans-serif" font-size="72" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">${escapeXml(initials)}</text>
    <text x="600" y="260" font-family="system-ui,-apple-system,sans-serif" font-size="18" fill="${fg}" text-anchor="middle" opacity="0.7">${escapeXml(eventName.substring(0, 50))}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Generates a small avatar placeholder as an inline SVG data-URI.
 * 80x80 circle with initials.
 */
export function avatarSvg(displayName: string): string {
  const { bg, fg } = getColorPair(displayName);
  const initials = getInitials(displayName);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">
    <rect width="80" height="80" rx="40" fill="${bg}"/>
    <text x="40" y="42" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="600" fill="${fg}" text-anchor="middle" dominant-baseline="central">${escapeXml(initials)}</text>
  </svg>`;

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/** Escape text for safe SVG embedding */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
