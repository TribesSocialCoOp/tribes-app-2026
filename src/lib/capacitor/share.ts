import { Share } from '@capacitor/share';
import { isNative } from './platform';

/**
 * Open the native OS share sheet.
 * Falls back to Web Share API or copy-to-clipboard if not native.
 */
export async function shareContent(options: { title?: string; text?: string; url?: string }) {
  if (isNative) {
    try {
      const canShare = await Share.canShare();
      if (canShare.value) {
        await Share.share(options);
        return true;
      }
    } catch (err) {
      console.warn('[share] Native share failed:', err);
    }
  }

  // Fallback to Web Share API
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share(options);
      return true;
    } catch (err) {
      // User cancelled or browser error
    }
  }

  return false;
}
