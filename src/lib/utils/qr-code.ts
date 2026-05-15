/**
 * @fileoverview QR Code generation — local + offline-capable.
 *
 * Uses the `qrcode` npm package (already installed for TOTP) to generate
 * QR codes as data URLs. Works fully offline — no external API needed.
 *
 * Legacy: getQRCodeUrl() is deprecated — it relied on qrserver.com which
 * fails offline (exactly when in-person bonding is most useful).
 */

import QRCode from 'qrcode';

/**
 * Generate a QR code as a data URL (PNG base64).
 * Works fully offline — no network required.
 *
 * @param data  - The string to encode (typically a URL)
 * @param size  - Width/height in pixels (default 256)
 * @returns Promise resolving to a data:image/png;base64,... URL
 */
export async function generateQRDataUrl(data: string, size = 256): Promise<string> {
  return QRCode.toDataURL(data, {
    width: size,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
    errorCorrectionLevel: 'M',
  });
}

/**
 * @deprecated Use generateQRDataUrl() instead — this relies on an external API
 * that fails offline.
 */
export function getQRCodeUrl(data: string, size = 256): string {
  const encoded = encodeURIComponent(data);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&margin=8&format=svg`;
}
