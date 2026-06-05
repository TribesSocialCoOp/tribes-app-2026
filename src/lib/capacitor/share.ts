import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative, isIos, isAndroid } from './platform';

/**
 * Save or share an image.
 * iOS: opens native share sheet (includes "Save to Photos").
 * Android: fetches blob → writes to Downloads via Capacitor Filesystem.
 * Web: fetches blob → triggers download via <a download>.
 *   Falls back to new-tab if fetch fails (e.g. missing CORS headers).
 */
export async function downloadImage(url: string): Promise<void> {
  // iOS share sheet handles image URLs natively and offers "Save to Photos"
  if (isIos) {
    await shareContent({ url });
    return;
  }

  // Android: <a download> is silently ignored in Capacitor WebView.
  // Use Filesystem plugin to write to the device Downloads folder.
  if (isAndroid) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const fileName = url.split('/').pop() ?? 'image.jpg';
      await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Documents,
      });
      // Brief visual feedback could be added here via toast
    } catch {
      // Fallback: open in browser tab so user can long-press to save
      window.open(url, '_blank', 'noopener');
    }
    return;
  }

  // Web: fetch the image as a blob and trigger a download.
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = url.split('/').pop() ?? 'image';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    // CORS or network error — open in new tab as last resort
    window.open(url, '_blank', 'noopener');
  }
}

/** Convert a Blob to a base64 string (without the data URL prefix). */
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Strip "data:image/png;base64," prefix
      resolve(result.split(',')[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
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
