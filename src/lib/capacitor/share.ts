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

/**
 * Save an already-decrypted image Blob to the device (used for E2E-encrypted
 * images, whose pixels live in a client-side Blob — there is no fetchable URL).
 * iOS: writes to cache, then opens the share sheet (offers "Save Image" / "Save to Files").
 * Android: writes to app-external storage (Files app), no sheet.
 * Web: triggers an <a download>.
 */
export async function downloadImageBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (isNative) {
    try {
      const base64 = await blobToBase64(blob);
      // Android saves straight to external storage; iOS routes through the share
      // sheet (no direct Photos-write API without extra permissions/plugins).
      const directory = isAndroid ? Directory.External : Directory.Cache;
      const result = await Filesystem.writeFile({ path: fileName, data: base64, directory });
      if (isAndroid) return true;
      await Share.share({ url: result.uri });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(msg)) return true; // user dismissed the sheet — not an error
      console.warn('[downloadImageBlob] native save failed:', err);
      return false;
    }
  }

  // Web: object URL + <a download>
  try {
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    return true;
  } catch (err) {
    console.warn('[downloadImageBlob] web download failed:', err);
    return false;
  }
}

/**
 * Share an already-decrypted image Blob via the native OS share sheet / Web Share API.
 * Native: writes to cache then Share.share({ files }).
 * Web: navigator.share({ files }) when supported, else falls back to a download.
 */
export async function shareImageBlob(blob: Blob, fileName: string): Promise<boolean> {
  if (isNative) {
    try {
      const base64 = await blobToBase64(blob);
      const result = await Filesystem.writeFile({ path: fileName, data: base64, directory: Directory.Cache });
      await Share.share({ files: [result.uri] });
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/cancel/i.test(msg)) return true;
      console.warn('[shareImageBlob] native share failed:', err);
      return false;
    }
  }

  // Web: Web Share API with a File attachment (supported on mobile browsers / some desktop)
  try {
    const file = new File([blob], fileName, { type: blob.type || 'image/jpeg' });
    if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] });
      return true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/abort/i.test(msg)) return true; // user cancelled
    console.warn('[shareImageBlob] web share failed:', err);
  }

  // Desktop / unsupported: fall back to saving the image.
  return downloadImageBlob(blob, fileName);
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
