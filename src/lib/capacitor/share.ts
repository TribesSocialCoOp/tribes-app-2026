import { Share } from '@capacitor/share';
import { isNative } from './platform';

/**
 * Save or share an image.
 * Native: opens OS share sheet (includes "Save to Photos" on iOS).
 * Web: fetches the image and triggers a file download.
 */
export async function downloadImage(url: string): Promise<void> {
  if (isNative) {
    await shareContent({ url });
    return;
  }
  const res = await fetch(url);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = url.split('/').pop() ?? 'image';
  a.click();
  URL.revokeObjectURL(objectUrl);
}

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
