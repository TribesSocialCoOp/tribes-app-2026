/**
 * Client-side image normalization.
 *
 * Converts HEIC/HEIF (and other exotic formats) to JPEG and compresses
 * large images to a mobile-friendly size before upload.
 *
 * Uses browser-image-compression which runs in a Web Worker (non-blocking).
 * The library is lazy-loaded — only fetched when a user actually attaches an image.
 *
 * Important: HEIC decoding relies on the browser's native canvas/createImageBitmap.
 * Safari/WKWebView decode HEIC natively, and those are the only environments that
 * produce HEIC files, so this always works where it matters.
 */

/** Max dimension in pixels — covers 2× retina for ~400pt feed cards */
const MAX_DIMENSION = 1600;
/** Target max file size in MB */
const MAX_SIZE_MB = 1.5;
/** JPEG quality — visually indistinguishable from 0.95 at 1600px */
const INITIAL_QUALITY = 0.82;
/** Types that can skip normalization if already small enough */
const WEB_SAFE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
/** Size threshold — files under this skip compression entirely */
const PASSTHROUGH_SIZE = MAX_SIZE_MB * 1024 * 1024;

/**
 * Normalize an image file for upload.
 *
 * - Web-safe formats (JPEG/PNG/WebP/GIF) under 1.5MB pass through unchanged
 * - Everything else (HEIC, HEIF, BMP, TIFF, oversized JPEGs) gets converted
 *   to JPEG at 1600px max dimension, ≤1.5MB
 *
 * @returns A normalized File object (always image/jpeg if converted)
 */
export async function normalizeImage(file: File): Promise<File> {
  // Fast path: web-safe format AND small enough — skip processing
  if (WEB_SAFE_TYPES.has(file.type) && file.size <= PASSTHROUGH_SIZE) {
    return file;
  }

  try {
    let fileToCompress = file;
    const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || file.name.toLowerCase().endsWith('.heic');

    if (isHeic) {
      const heic2any = (await import('heic2any')).default;
      const convertedBlob = await heic2any({
        blob: file,
        toType: 'image/jpeg',
        quality: INITIAL_QUALITY
      });
      const blobArray = Array.isArray(convertedBlob) ? convertedBlob : [convertedBlob];
      fileToCompress = new File([blobArray[0]], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
    }

    const imageCompression = (await import('browser-image-compression')).default;

    const compressed = await imageCompression(fileToCompress, {
      maxSizeMB: MAX_SIZE_MB,
      maxWidthOrHeight: MAX_DIMENSION,
      fileType: 'image/jpeg',
      useWebWorker: true,
      initialQuality: INITIAL_QUALITY,
      // Preserve EXIF orientation but strip other metadata (GPS, etc.)
      preserveExif: false,
    });

    // Return as a proper File (browser-image-compression returns a Blob in some versions)
    if (compressed instanceof File) {
      return compressed;
    }
    return new File([compressed], fileToCompress.name.replace(/\.[^.]+$/, '.jpg'), {
      type: 'image/jpeg',
    });
  } catch (err) {
    // If compression fails (corrupt file, unsupported codec), return original
    // and let the server validate. This is better than silently dropping the image.
    console.warn('[image-utils] Normalization failed, using original file:', err);
    return file;
  }
}
