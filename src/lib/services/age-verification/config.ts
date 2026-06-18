/**
 * @fileoverview Env-driven config for the wallet age-verification providers (issue #32).
 *
 * Google Wallet sandbox provides drop-in test RP credentials (private key PEM, cert,
 * RP metadata) that are pre-trusted in sandbox only. Drop them into these env vars to
 * light up the wallet flow — no code change. See:
 *   https://developers.google.com/wallet/identity/verify/sandbox
 *
 * Required to enable a provider:
 *   <PREFIX>_RP_ID            client_id = x509 hash of the RP cert (sandbox-issued)
 *   <PREFIX>_READER_KEY_PEM   RP private key (PEM) used to JWS-sign the request
 *   <PREFIX>_READER_CERT_PEM  RP certificate (PEM) embedded in the request's x5c
 *   <PREFIX>_IACA_PEM         one or more issuer/IACA trust-anchor certs (PEM, concatenated)
 * Optional:
 *   <PREFIX>_RP_METADATA      base64url CBOR RP metadata (display name/logo/policy)
 *   <PREFIX>_DOCTYPE          mdoc doctype to request (default org.iso.18013.5.1.mDL)
 *   <PREFIX>_NAMESPACE        namespace holding age_over_18 (default org.iso.18013.5.1)
 *
 * PREFIX is GOOGLE_WALLET or APPLE_WALLET.
 */

export interface WalletProviderConfig {
  rpId: string;
  readerKeyPem: string;
  readerCertPem: string;
  /** IACA / issuer trust anchors, split into individual PEM blocks. */
  iacaPems: string[];
  rpMetadataB64?: string;
  doctype: string;
  namespace: string;
}

const DEFAULT_DOCTYPE = 'org.iso.18013.5.1.mDL';
const DEFAULT_NAMESPACE = 'org.iso.18013.5.1';

function splitPemBlocks(pem?: string): string[] {
  if (!pem) return [];
  const matches = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  return matches ?? [];
}

export function loadWalletConfig(prefix: 'GOOGLE_WALLET' | 'APPLE_WALLET'): WalletProviderConfig | null {
  const rpId = process.env[`${prefix}_RP_ID`];
  const readerKeyPem = process.env[`${prefix}_READER_KEY_PEM`];
  const readerCertPem = process.env[`${prefix}_READER_CERT_PEM`];
  const iacaPems = splitPemBlocks(process.env[`${prefix}_IACA_PEM`]);

  // A provider is only "available" when fully configured to verify a real attestation.
  if (!rpId || !readerKeyPem || !readerCertPem || iacaPems.length === 0) return null;

  return {
    rpId,
    readerKeyPem,
    readerCertPem,
    iacaPems,
    rpMetadataB64: process.env[`${prefix}_RP_METADATA`],
    doctype: process.env[`${prefix}_DOCTYPE`] || DEFAULT_DOCTYPE,
    namespace: process.env[`${prefix}_NAMESPACE`] || DEFAULT_NAMESPACE,
  };
}
