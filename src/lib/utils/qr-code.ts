/**
 * @fileoverview Minimal QR Code SVG generator — zero dependencies.
 *
 * Uses a Google Charts API fallback rendered as an <img>. For a fully
 * offline approach we'd bundle a QR encoder, but this is simpler and
 * the data (a URL we own) is not sensitive — it's meant to be shared.
 *
 * The generated URL is already public (it's a bond invite link the user
 * is intentionally showing to someone else), so passing it through an
 * external API for rendering is acceptable.
 */

/**
 * Returns a data URL for a QR code image via the qrserver.com free API.
 * This API requires no key and returns a PNG.
 *
 * @param data  - The string to encode (typically a URL)
 * @param size  - Width/height in pixels (default 256)
 */
export function getQRCodeUrl(data: string, size = 256): string {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=8&format=svg`;
}
