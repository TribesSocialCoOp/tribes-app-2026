/**
 * Safe base64 encoding/decoding for ArrayBuffers.
 *
 * The naive `btoa(String.fromCharCode(...new Uint8Array(buf)))` crashes with
 * "RangeError: Maximum call stack size exceeded" for buffers larger than ~50 KB
 * because the spread operator creates a function call with N arguments.
 *
 * These helpers process data in 8 KB chunks to stay well within the call-stack
 * limit while keeping the implementation browser-compatible (no Node `Buffer`).
 */

const CHUNK_SIZE = 8192;

/** Convert an ArrayBuffer to a base64-encoded string (browser-safe, chunked). */
export function toBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK_SIZE));
    }
    return btoa(binary);
}

/** Convert a base64-encoded string back to an ArrayBuffer. */
export function fromBase64(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}
