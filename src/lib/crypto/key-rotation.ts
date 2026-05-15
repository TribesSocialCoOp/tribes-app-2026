'use client';

/**
 * @fileoverview Helpers for key rotation re-derivation and re-wrapping.
 * Phase 1: Historical re-derivation.
 * Phase 2: Automated re-wrapping.
 */

import { getPeerBondKeyHistory } from "@/lib/actions/bond-actions";
import { importPublicKey, deriveSharedSecret } from "./key-manager";
import { 
  hashPublicKeyJwk, 
  storeSharedSecret, 
  getBondKey, 
  getSharedSecret, 
  getHistoricalSharedSecrets 
} from "./key-store";
import { unwrapPostKey } from "./post-encryption";

/**
 * Fetches the peer's entire public key history and derives/caches
 * a shared secret for every version we don't already have.
 * 
 * Called by the sync loop when a peer key rotation is detected.
 */
export async function cachePeerKeyHistory(bondId: string, myPrivateKey: CryptoKey) {
  try {
    const history = await getPeerBondKeyHistory(bondId);
    const myKeyEntry = await getBondKey(bondId);
    if (!myKeyEntry) return;
    
    const localHash = await hashPublicKeyJwk(myKeyEntry.publicKeyJwk);

    for (const entry of history) {
      try {
        const peerJwk = JSON.parse(entry.publicKeyJwk);
        const peerPublicKey = await importPublicKey(peerJwk);
        const secret = await deriveSharedSecret(myPrivateKey, peerPublicKey);
        
        // Store as historical (isCurrent = false)
        await storeSharedSecret(bondId, secret, entry.keyHash, localHash, false);
        console.debug(`[key-rotation] Cached historical secret for bond ${bondId.substring(0, 8)}... (hash: ${entry.keyHash.substring(0, 8)})`);
      } catch (err) {
        // Mismatch or already exists, skip
      }
    }
  } catch (err) {
    console.warn(`[key-rotation] Error fetching history for bond ${bondId}:`, err);
  }
}

/**
 * Attempts to unwrap a post key using the current shared secret,
 * falling back to historical secrets if that fails.
 * 
 * Used during feed load to ensure we can read messages from old key epochs.
 */
export async function resolvePostKeyForGrant(
  bondId: string, 
  wrappedKey: string, 
  wrapIv: string
): Promise<CryptoKey | null> {
  // 1. Try current secret first
  const current = await getSharedSecret(bondId);
  if (current) {
    try {
      return await unwrapPostKey(wrappedKey, wrapIv, current.sharedSecret);
    } catch (err) {
      // Mismatch, proceed to historical
    }
  }

  // 2. Fallback: try all historical secrets for this bond
  const historical = await getHistoricalSharedSecrets(bondId);
  for (const h of historical) {
    try {
      return await unwrapPostKey(wrappedKey, wrapIv, h.sharedSecret);
    } catch (err) {
      // Mismatch, try next one
    }
  }

  return null;
}
