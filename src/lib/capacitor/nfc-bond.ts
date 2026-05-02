import { CapacitorNfc, type NdefRecord, type NfcEvent } from '@capgo/capacitor-nfc';
import { isNative, platform } from './platform';
import { triggerNotificationHaptic } from './haptics';
import { NotificationType } from '@capacitor/haptics';

/**
 * Helper: build a well-known URI NDEF record from a URL string.
 * TNF 1 = Well-Known, Type = [0x55] = 'U'
 * Payload: prefix byte 0x04 (https://) + rest of URL after stripping scheme
 */
function buildUriRecord(url: string): NdefRecord {
  // Strip scheme — prefix byte 0x04 = "https://"
  let stripped = url;
  let prefixByte = 0x00; // no prefix
  if (url.startsWith('https://')) {
    stripped = url.slice(8);
    prefixByte = 0x04;
  } else if (url.startsWith('http://')) {
    stripped = url.slice(7);
    prefixByte = 0x03;
  }

  const payloadBytes = [prefixByte, ...Array.from(new TextEncoder().encode(stripped))];

  return {
    tnf: 1, // Well-Known
    type: [0x55], // 'U' = URI record
    id: [],
    payload: payloadBytes,
  };
}

/**
 * NFC Service for Bond Tap-to-Bond.
 *
 * Two modes:
 * - Phone A writes a bond URL to a physical NFC tag (or shares via P2P on Android).
 * - Phone B scans and reads the URL, then navigates to the bond acceptance page.
 */
export const NFCService = {
  /**
   * Start scanning for NFC tags containing a bond URL.
   * Returns the URL found on the first discovered tag.
   */
  async scanForBond(): Promise<string | null> {
    if (!isNative) return null;

    try {
      await CapacitorNfc.startScanning({
        alertMessage: 'Hold near the other phone to bond',
      });

      return new Promise((resolve) => {
        const listener = CapacitorNfc.addListener('nfcEvent', (event: NfcEvent) => {
          const records = event.tag?.ndefMessage;
          if (!records || records.length === 0) {
            resolve(null);
            CapacitorNfc.stopScanning();
            listener.then(h => h.remove());
            return;
          }

          // Find a URI record (TNF=1, type=[0x55])
          const uriRecord = records.find(
            (r) => r.tnf === 1 && r.type.length === 1 && r.type[0] === 0x55,
          );

          if (uriRecord && uriRecord.payload.length > 1) {
            const prefixByte = uriRecord.payload[0];
            const rest = new TextDecoder().decode(
              new Uint8Array(uriRecord.payload.slice(1)),
            );

            const prefixMap: Record<number, string> = {
              0x00: '',
              0x01: 'http://www.',
              0x02: 'https://www.',
              0x03: 'http://',
              0x04: 'https://',
            };
            const url = (prefixMap[prefixByte] ?? '') + rest;

            triggerNotificationHaptic(NotificationType.Success);
            resolve(url);
          } else {
            resolve(null);
          }

          CapacitorNfc.stopScanning();
          listener.then(h => h.remove());
        });
      });
    } catch (err) {
      console.warn('[nfc] Scan failed:', err);
      return null;
    }
  },

  /**
   * Write a bond URL to a physical NFC tag.
   *
   * Starts a scan session — the user taps a writable NFC tag, and we write the
   * NDEF URI record to it. On Android, this can also be used with P2P share()
   * to push the URL directly to the other phone.
   */
  async writeBondUrl(url: string): Promise<boolean> {
    if (!isNative) return false;

    const record = buildUriRecord(url);

    // On Android, prefer P2P share (beam-like behavior) for phone-to-phone
    if (platform === 'android') {
      try {
        await CapacitorNfc.share({ records: [record] });
        triggerNotificationHaptic(NotificationType.Success);
        return true;
      } catch (err) {
        console.warn('[nfc] Android share failed, falling back to tag write:', err);
      }
    }

    // iOS / fallback: start scanning, then write to the first tag discovered
    try {
      await CapacitorNfc.startScanning({
        alertMessage: 'Hold near the other device to bond',
      });

      return new Promise((resolve) => {
        const listener = CapacitorNfc.addListener('nfcEvent', async () => {
          try {
            await CapacitorNfc.write({ records: [record] });
            triggerNotificationHaptic(NotificationType.Success);
            resolve(true);
          } catch (writeErr) {
            console.warn('[nfc] Write to tag failed:', writeErr);
            resolve(false);
          } finally {
            await CapacitorNfc.stopScanning();
            (await listener).remove();
          }
        });
      });
    } catch (err) {
      console.warn('[nfc] Write session failed:', err);
      return false;
    }
  },

  /**
   * Check if the device has NFC hardware.
   */
  async isSupported(): Promise<boolean> {
    if (!isNative) return false;
    try {
      const { supported } = await CapacitorNfc.isSupported();
      return !!supported;
    } catch {
      return false;
    }
  },

  /**
   * Check if NFC is currently enabled (hardware present AND toggled on).
   */
  async isEnabled(): Promise<boolean> {
    if (!isNative) return false;
    try {
      const { status } = await CapacitorNfc.getStatus();
      return status === 'NFC_OK';
    } catch {
      return false;
    }
  },
};
