/**
 * @fileoverview OpenID4VP (DC-API) request building + response verification for wallet
 * age verification (issue #32). Shared by the Google and Apple Wallet providers.
 *
 * Flow:
 *   1. buildAgeRequest() — server builds a signed OpenID4VP request asking for a
 *      selective-disclosure age_over_18 claim, plus an opaque verifierState blob that
 *      carries the nonce + ephemeral response-decryption key (stateless; no DB needed).
 *   2. Client runs navigator.credentials.get({ digital }) with that request.
 *   3. verifyAgeResponse() — server decrypts the wallet's JWE response, rebuilds the
 *      ISO 18013-7 DC-API session transcript, verifies the mdoc against the IACA trust
 *      anchors via @owf/mdoc, and reads age_over_18.
 *
 * ⚠️ The exact OpenID4VP/DC-API wire shapes evolve across drafts and differ slightly in
 * Google's sandbox. This is implemented to the documented shapes but the request/response
 * handshake MUST be validated against a live sandbox round-trip. The cryptographic
 * verification (mdoc-context) is standards-based but likewise untested without a device.
 */
import {
  SignJWT, importPKCS8, importJWK, exportJWK, generateKeyPair,
  compactDecrypt, calculateJwkThumbprint, EncryptJWT, jwtDecrypt,
  type JWK,
} from 'jose';
import { createHash, X509Certificate } from 'node:crypto';
import { DeviceResponse, SessionTranscript } from '@owf/mdoc';
import { nodeMdocContext } from './mdoc-context';
import type { WalletProviderConfig } from './config';

const STATE_TTL = '10m';

function stateKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET || '';
  if (secret.length < 16) throw new Error('SESSION_SECRET is required for age-verification state.');
  return new Uint8Array(createHash('sha256').update(secret).digest()); // 32 bytes for A256GCM
}

function pemToDerBase64(pem: string): string {
  return Buffer.from(new X509Certificate(pem).raw).toString('base64');
}

export interface BuiltAgeRequest {
  /** The `digital` request object to pass to navigator.credentials.get(). */
  request: unknown;
  /** Opaque, encrypted state echoed back with the response (nonce + decrypt key). */
  verifierState: string;
}

/** Build a signed OpenID4VP DC-API request for a selective-disclosure age_over_18 claim. */
export async function buildAgeRequest(cfg: WalletProviderConfig, origin: string): Promise<BuiltAgeRequest> {
  const nonce = Buffer.from(nodeMdocContext.crypto.random(32)).toString('base64url');

  // Ephemeral key for the encrypted wallet response (ECDH-ES / A256GCM).
  const { publicKey, privateKey } = await generateKeyPair('ECDH-ES', { extractable: true, crv: 'P-256' });
  const publicJwk = await exportJWK(publicKey);
  const privateJwk = await exportJWK(privateKey);
  publicJwk.use = 'enc';
  publicJwk.alg = 'ECDH-ES';

  const requestPayload = {
    response_type: 'vp_token',
    response_mode: 'dc_api.jwt', // encrypted response
    client_id: cfg.rpId,
    nonce,
    dcql_query: {
      credentials: [{
        id: 'age',
        format: 'mso_mdoc',
        meta: { doctype_value: cfg.doctype },
        claims: [{ path: [cfg.namespace, 'age_over_18'] }],
      }],
    },
    client_metadata: {
      jwks: { keys: [publicJwk] },
      authorization_encrypted_response_alg: 'ECDH-ES',
      authorization_encrypted_response_enc: 'A256GCM',
      ...(cfg.rpMetadataB64 ? { rp_metadata: cfg.rpMetadataB64 } : {}),
    },
  };

  // Sign the request object (JWS) with the RP reader key; embed the RP cert in x5c.
  const readerKey = await importPKCS8(cfg.readerKeyPem, 'ES256');
  const signedRequest = await new SignJWT(requestPayload)
    .setProtectedHeader({ alg: 'ES256', typ: 'oauth-authz-req+jwt', x5c: [pemToDerBase64(cfg.readerCertPem)] })
    .sign(readerKey);

  // Stateless verifier state: nonce + ephemeral private key + origin, AEAD-sealed.
  const verifierState = await new EncryptJWT({ nonce, origin, privateJwk: privateJwk as unknown as Record<string, unknown> })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(STATE_TTL)
    .encrypt(stateKey());

  return {
    request: { protocol: 'openid4vp-v1-signed', data: signedRequest },
    verifierState,
  };
}

export interface AgeResponseInput {
  /** The raw response object returned by navigator.credentials.get(). */
  attestation: unknown;
  /** The verifierState blob returned alongside the original request. */
  verifierState: string;
  /** The web origin that made the request (must match the sealed origin). */
  origin: string;
}

/** Verify a wallet's OpenID4VP DC-API response and return whether age_over_18 holds. */
export async function verifyAgeResponse(cfg: WalletProviderConfig, input: AgeResponseInput): Promise<boolean> {
  // 1. Recover sealed state (nonce + decrypt key) and bind to origin.
  const { payload } = await jwtDecrypt(input.verifierState, stateKey());
  const nonce = payload.nonce as string;
  const sealedOrigin = payload.origin as string;
  const privateJwk = payload.privateJwk as JWK;
  if (!nonce || !privateJwk) throw new Error('Invalid verifier state.');
  if (sealedOrigin !== input.origin) throw new Error('Origin mismatch.');

  // 2. Pull the (possibly encrypted) vp_token out of the DC-API response.
  const vpToken = await extractVpToken(input.attestation, privateJwk);
  const deviceResponseBytes = decodeDeviceResponseBytes(vpToken);

  // 3. Rebuild the ISO 18013-7 DC-API session transcript bound to our nonce + key.
  const encPublicJwk = { ...privateJwk }; delete (encPublicJwk as Record<string, unknown>).d;
  const jwkThumbprint = Buffer.from(await calculateJwkThumbprint(encPublicJwk, 'sha256'), 'base64url');
  const sessionTranscript = await SessionTranscript.forOid4VpDcApi(
    { origin: input.origin, nonce, jwkThumbprint: new Uint8Array(jwkThumbprint) },
    { crypto: nodeMdocContext.crypto },
  );

  // 4. Verify the mdoc against the IACA trust anchors (throws on any failure).
  const trustedCertificates = cfg.iacaPems.map((pem) => new Uint8Array(new X509Certificate(pem).raw));
  await Verifier_verify(deviceResponseBytes, sessionTranscript, trustedCertificates);

  // 5. Read the verified age_over_18 claim.
  const decoded = DeviceResponse.decode(deviceResponseBytes);
  const doc = decoded.documents?.find((d) => d.docType === cfg.doctype) ?? decoded.documents?.[0];
  if (!doc) throw new Error('No document in device response.');
  const claims = (doc.issuerSigned.getPrettyClaims(cfg.namespace) ?? {}) as Record<string, unknown>;
  return claims.age_over_18 === true;
}

// Indirection so the Verifier import stays isolated and easy to mock in future tests.
async function Verifier_verify(
  deviceResponse: Uint8Array,
  sessionTranscript: SessionTranscript,
  trustedCertificates: Uint8Array[],
): Promise<void> {
  const { Verifier } = await import('@owf/mdoc');
  await Verifier.verifyDeviceResponse(
    { deviceResponse, sessionTranscript, trustedCertificates },
    nodeMdocContext,
  );
}

/** Decrypt (if needed) and locate the mdoc vp_token in the DC-API response. */
async function extractVpToken(attestation: unknown, privateJwk: JWK): Promise<string> {
  const a = attestation as Record<string, any>;
  // Encrypted response (response_mode dc_api.jwt): a compact JWE we decrypt to JSON.
  const jwe: string | undefined = a?.response ?? (typeof a?.data === 'string' ? a.data : undefined);
  let payload: Record<string, any> = a;
  if (jwe && jwe.split('.').length === 5) {
    const key = await importJWK(privateJwk, 'ECDH-ES');
    const { plaintext } = await compactDecrypt(jwe, key);
    payload = JSON.parse(new TextDecoder().decode(plaintext));
  }
  const vp = payload.vp_token ?? payload.data?.vp_token ?? payload;
  // vp_token is keyed by the requested credential id ('age'), or a bare string.
  const token = typeof vp === 'string' ? vp : (vp.age ?? Object.values(vp)[0]);
  if (typeof token !== 'string') throw new Error('No vp_token in response.');
  return token;
}

function decodeDeviceResponseBytes(vpToken: string): Uint8Array {
  // base64url-encoded CBOR device response.
  return new Uint8Array(Buffer.from(vpToken, 'base64url'));
}
