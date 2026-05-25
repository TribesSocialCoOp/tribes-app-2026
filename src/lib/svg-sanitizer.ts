/**
 * SVG utilities — URL detection helpers for SVG files.
 *
 * NOTE: Server-side sanitization (DOMPurify) was removed because jsdom
 * lowercases SVG element names (e.g. feDropShadow → fedropshadow), breaking
 * rendering. SVGs are safe via three layers:
 *   1. Feed/post rendering uses <img> tags (scripts don't execute)
 *   2. Lightbox <object> tag renders from media.tribes.app (separate origin)
 *   3. CSP on media.tribes.app: script-src 'none'; object-src 'none'
 */

/**
 * Check if a URL points to an SVG file.
 */
export function isSvgUrl(url: string): boolean {
  if (!url) return false;
  try {
    const pathname = new URL(url, 'https://placeholder.local').pathname;
    return pathname.toLowerCase().endsWith('.svg');
  } catch {
    return url.toLowerCase().endsWith('.svg');
  }
}

/**
 * Check if a File object is an SVG.
 * Handles the MIME type and file extension (Android sometimes reports wrong MIME).
 */
export function isSvgFile(file: { type?: string; name?: string }): boolean {
  return file.type === 'image/svg+xml' || !!file.name?.toLowerCase().endsWith('.svg');
}
