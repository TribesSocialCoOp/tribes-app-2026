import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { isNative, isIos, isAndroid } from './platform';

/**
 * Save an image to the device.
 * iOS: opens native share sheet (includes "Save to Photo Library").
 * Android: writes to app-accessible external storage (Files app > Internal Storage > Android > data > …).
 *          No share sheet — just saves and returns.
 * Web: triggers a blob download via <a download>.
 */
export async function downloadImage(url: string): Promise<boolean> {
  if (isIos) {
    // iOS share sheet offers "Save to Photo Library" natively
    return shareContent({ url });
  }

  if (isAndroid) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const fileName = url.split('/').pop() ?? 'image.jpg';
      // Directory.External = getExternalFilesDir() — app-specific external storage,
      // accessible via Files app, no runtime permissions required on any Android version.
      await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.External,
      });
      return true;
    } catch (err) {
      console.warn('[downloadImage] Android save failed:', err);
      return false;
    }
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
    return true;
  } catch {
    // CORS or network error — open in new tab as last resort
    window.open(url, '_blank', 'noopener');
    return false;
  }
}

/**
 * Share an image via the native OS share sheet.
 * iOS: passes the remote URL directly — iOS handles remote image URLs natively.
 * Android: downloads to cache first, then shares the local file URI.
 *          Passing a remote HTTPS URL to Share.share() crashes the Android bridge.
 * Web: falls back to Web Share API.
 */
export async function shareImage(url: string): Promise<boolean> {
  if (isIos) {
    return shareContent({ url });
  }

  if (isAndroid) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const base64 = await blobToBase64(blob);
      const fileName = url.split('/').pop() ?? 'image.jpg';
      // Write to cache — no permissions needed, OS cleans it up automatically
      const result = await Filesystem.writeFile({
        path: fileName,
        data: base64,
        directory: Directory.Cache,
      });
      await Share.share({ files: [result.uri] });
      return true;
    } catch (err) {
      // Capacitor throws "Share canceled" when the user dismisses the sheet — not an error
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(msg)) return true;
      console.warn('[shareImage] Android share failed:', err);
      return false;
    }
  }

  // Web: use Web Share API if available
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ url });
      return true;
    } catch {
      // User cancelled or browser error
    }
  }

  return false;
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
 * Open the native OS share sheet for a URL or text.
 * Falls back to Web Share API if not native.
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
    } catch {
      // User cancelled or browser error
    }
  }

  return false;
}
