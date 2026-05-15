/**
 * @fileoverview WebAuthn PRF ceremony helpers.
 *
 * Wraps navigator.credentials.get() with the PRF extension to derive a
 * hardware-backed wrapping key for vault encryption/decryption.
 *
 * ⚠️ Browser-only module.
 */

import { getPrfSaltBytes } from './prf-vault';

export interface PrfAuthResult {
  /** The 32-byte PRF output from the authenticator */
  prfOutput: ArrayBuffer;
  /** The credential ID used (needed to look up the correct vault on the server) */
  credentialId: string;
}

/**
 * Triggers a WebAuthn authentication ceremony with the PRF extension.
 *
 * @param allowCredentials Optional list of credential IDs to restrict to.
 *   If omitted, the platform will show all available passkeys.
 * @returns The PRF output and credential ID, or null if user cancelled.
 */
export async function authenticateWithPrf(
  allowCredentials?: string[]
): Promise<PrfAuthResult | null> {
  if (typeof window === 'undefined' || !navigator.credentials) {
    throw new Error('WebAuthn not available');
  }

  const prfSalt = await getPrfSaltBytes();

  // Build credential descriptors if provided
  const credentialDescriptors = allowCredentials?.map(id => ({
    type: 'public-key' as const,
    id: base64UrlToBuffer(id),
  }));

  try {
    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rpId: window.location.hostname,
        userVerification: 'required',
        ...(credentialDescriptors && { allowCredentials: credentialDescriptors }),
        extensions: {
          prf: {
            eval: {
              first: prfSalt,
            },
          },
        },
      },
    } as CredentialRequestOptions) as PublicKeyCredential | null;

    if (!credential) return null;

    // Extract PRF results from the extension output
    const extensionResults = credential.getClientExtensionResults() as Record<string, unknown>;
    const prfResults = (extensionResults?.prf as Record<string, unknown>)?.results as Record<string, ArrayBuffer> | undefined;

    if (!prfResults?.first) {
      throw new Error('PRF extension did not return a result. Your authenticator may not support PRF.');
    }

    // credential.id is already base64url-encoded
    const credentialId = credential.id;

    return {
      prfOutput: prfResults.first as ArrayBuffer,
      credentialId,
    };
  } catch (err: unknown) {
    // User cancelled
    if (err instanceof DOMException && (err.name === 'NotAllowedError' || err.name === 'AbortError')) {
      return null;
    }
    throw err;
  }
}

/**
 * Converts a base64url-encoded string to an ArrayBuffer.
 * Used for credential ID conversion.
 */
function base64UrlToBuffer(base64url: string): ArrayBuffer {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(base64 + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
