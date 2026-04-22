/**
 * @fileoverview PDQ Perceptual Image Hasher
 *
 * Wraps Meta's PDQ algorithm via pdq-wasm (WASM bindings, no native compilation)
 * combined with sharp for image decoding.
 *
 * Pipeline:
 *   Buffer (any image format) → sharp decode → RGB pixels → PDQ.hash() → hex string
 *
 * PDQ produces a 256-bit perceptual hash tolerant of JPEG re-compression, minor
 * cropping, resizing, and brightness/contrast changes — equivalent capability to
 * PhotoDNA but fully open source and self-hosted.
 *
 * Similarity is measured by Hamming distance:
 *   distance = 0   → identical image
 *   distance ≤ 31  → likely same image (minor modification) — NCMEC threshold
 *   distance > 31  → different images
 *
 * PDQ.hammingDistance() is built into pdq-wasm; we use it rather than our own
 * implementation for correctness against the reference algorithm.
 *
 * Source: https://github.com/facebook/ThreatExchange/tree/main/pdq
 * npm:    https://www.npmjs.com/package/pdq-wasm
 */

import sharp from 'sharp';
import { csamLogger } from '@/lib/logger';

// ── PDQ Singleton ───────────────────────────────────────────

let pdqInitialized = false;
let PDQClass: typeof import('pdq-wasm').PDQ | null = null;

async function getPDQ() {
  if (!pdqInitialized) {
    const mod = await import('pdq-wasm');
    PDQClass = mod.PDQ;
    await PDQClass.init();
    pdqInitialized = true;
  }
  return PDQClass!;
}

// ── Types ───────────────────────────────────────────────────

export interface PdqHashResult {
  hash: Uint8Array;   // Raw 32-byte PDQ hash
  hashHex: string;    // 64-char hex representation
  quality: number;    // 0–100 (below 50 = too uniform to hash reliably)
}

// PDQ recommended similarity threshold
export const PDQ_MATCH_THRESHOLD = 31;

// ── Core ────────────────────────────────────────────────────

/**
 * Compute a PDQ perceptual hash from a raw image buffer.
 * Supports any format sharp can decode: JPEG, PNG, WebP, GIF, AVIF, TIFF.
 *
 * Returns null if the image cannot be decoded or is too uniform to hash.
 */
export async function computePdqHash(
  buffer: Buffer
): Promise<PdqHashResult | null> {
  try {
    // Decode image to raw RGB pixels using sharp
    const { data, info } = await sharp(buffer)
      .removeAlpha()          // PDQ operates on RGB only
      .raw()                  // Output raw pixel bytes
      .toBuffer({ resolveWithObject: true });

    const PDQ = await getPDQ();

    const result = PDQ.hash({
      data: new Uint8Array(data),
      width: info.width,
      height: info.height,
      channels: 3,           // RGB
    });

    if (!result || result.quality < 1) {
      csamLogger.debug('PDQ: no hash produced (image too uniform or too small)');
      return null;
    }

    return {
      hash: result.hash,
      hashHex: PDQ.toHex(result.hash),
      quality: result.quality,
    };
  } catch (err) {
    csamLogger.error({ err }, 'PDQ hash computation failed');
    return null;
  }
}

/**
 * Compute Hamming distance between two PDQ hashes.
 * Uses the built-in pdq-wasm implementation for correctness.
 *
 * @returns 0 = identical, 256 = maximum difference
 */
export async function pdqHammingDistance(
  hashA: Uint8Array,
  hashB: Uint8Array
): Promise<number> {
  const PDQ = await getPDQ();
  return PDQ.hammingDistance(hashA, hashB);
}

/**
 * Convert a hex string to a PDQ hash Uint8Array.
 * Used when loading hashes from the NCMEC hash list file.
 */
export async function pdqFromHex(hex: string): Promise<Uint8Array> {
  const PDQ = await getPDQ();
  return PDQ.fromHex(hex);
}
