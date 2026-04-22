/**
 * @fileoverview Client-side Web NFC bridge for bond tap formation.
 * Phase 2E: Feature-detected NFC support with QR fallback.
 *
 * The Web NFC API is only available on:
 * - Chrome for Android (89+)
 * - No support on iOS, Desktop Chrome, Firefox, Safari
 *
 * This module gracefully degrades — callers should always check
 * `isNfcSupported()` before attempting NFC operations.
 *
 * ⚠️ Browser-only module. Do NOT import from server-side code.
 */

// ============================================================
// FEATURE DETECTION
// ============================================================

/**
 * Checks if the Web NFC API is available in this browser.
 */
export function isNfcSupported(): boolean {
  return typeof window !== 'undefined' && 'NDEFReader' in window;
}

// ============================================================
// NFC OPERATIONS
// ============================================================

/**
 * Starts an NFC broadcast of a bond URL.
 * The receiving device will see a notification to open the URL.
 *
 * @param url The bond redemption URL to broadcast
 * @returns AbortController to stop the broadcast
 */
export async function startNfcBroadcast(url: string): Promise<AbortController> {
  if (!isNfcSupported()) {
    throw new Error('Web NFC is not supported in this browser');
  }

  const NDEFReaderClass = window.NDEFReader;
  if (!NDEFReaderClass) throw new Error('NDEFReader not available');
  const ndef = new NDEFReaderClass();
  const abort = new AbortController();

  await ndef.write(
    {
      records: [
        {
          recordType: 'url',
          data: url,
        },
      ],
    },
    { signal: abort.signal },
  );

  return abort;
}

/**
 * Listens for an incoming NFC tap and reads the URL from the tag.
 * Returns a promise that resolves with the URL when a tag is detected.
 *
 * @param signal Optional AbortSignal to cancel the scan
 * @returns The URL read from the NFC tag
 */
export async function listenForNfcTap(signal?: AbortSignal): Promise<string> {
  if (!isNfcSupported()) {
    throw new Error('Web NFC is not supported in this browser');
  }

  const NDEFReaderClass = window.NDEFReader;
  if (!NDEFReaderClass) throw new Error('NDEFReader not available');
  const ndef = new NDEFReaderClass();
  await ndef.scan({ signal });

  return new Promise((resolve, reject) => {
    if (signal) {
      signal.addEventListener('abort', () => reject(new Error('NFC scan cancelled')));
    }

    ndef.addEventListener('reading', (event: NDEFReadingEvent) => {
      const urlRecord = event.message.records.find(
        (r: NDEFRecord) => r.recordType === 'url',
      );
      if (urlRecord) {
        const url = new TextDecoder().decode(urlRecord.data);
        resolve(url);
      }
    });

    ndef.addEventListener('readingerror', () => {
      reject(new Error('NFC read error'));
    });
  });
}

// ============================================================
// UTILITIES
// ============================================================

/**
 * Returns a user-friendly string describing NFC support status.
 */
export function getNfcSupportDescription(): string {
  if (!isNfcSupported()) {
    return 'NFC is not available. Use the QR code to bond.';
  }
  return 'NFC is available! Hold phones together or scan the QR code.';
}
