import { CapacitorNFC } from '@capgo/capacitor-nfc';
import { isNative } from './platform';
import { triggerNotificationHaptic } from './haptics';
import { NotificationType } from '@capacitor/haptics';

/**
 * NFC Service for Bond Tap (NFC).
 */
export const NFCService = {
  /**
   * Start scanning for NFC tags.
   * On success, returns the URL found on the tag (if any).
   */
  async scanForBond(): Promise<string | null> {
    if (!isNative) return null;
    
    try {
      // Start scanning
      await CapacitorNFC.scan();
      
      return new Promise((resolve) => {
        const handler = (tag: any) => {
          // Find the first NDEF record that contains a URL
          const urlRecord = tag.ndef?.records?.find((r: any) => 
            r.type === 'U' || r.type === 'T' || r.tnf === 1
          );
          
          if (urlRecord) {
            triggerNotificationHaptic(NotificationType.Success);
            resolve(urlRecord.data);
          } else {
            resolve(null);
          }
          
          // Cleanup
          CapacitorNFC.stopScan();
        };
        
        CapacitorNFC.addListener('onTagDiscovered', handler);
      });
    } catch (err) {
      console.warn('[nfc] Scan failed:', err);
      return null;
    }
  },

  /**
   * Write a bond URL to an NFC tag.
   */
  async writeBondUrl(url: string): Promise<boolean> {
    if (!isNative) return false;
    
    try {
      await CapacitorNFC.write({
        records: [
          {
            type: 'U', // URL record type
            data: url
          }
        ]
      });
      triggerNotificationHaptic(NotificationType.Success);
      return true;
    } catch (err) {
      console.warn('[nfc] Write failed:', err);
      return false;
    }
  },

  /**
   * Check if NFC is available and enabled.
   */
  async isAvailable(): Promise<boolean> {
    if (!isNative) return false;
    try {
      const { available } = await CapacitorNFC.isAvailable();
      return !!available;
    } catch {
      return false;
    }
  }
};
