/**
 * End-to-end test for the wallet age-verification crypto path (issue #32) — NO hardware.
 *
 * It stands up a self-contained test PKI (IACA root → document signer), MINTS a real
 * ISO 18013-5 mdoc DeviceResponse with `age_over_18`, presents it against a request
 * produced by our own `buildAgeRequest`, and runs it through our real `verifyAgeResponse`
 * (which calls @owf/mdoc's Verifier: cert chain → COSE signature → device auth over the
 * session transcript → claim read). This validates the whole server-side crypto path the
 * Google/Apple sandboxes would exercise, plus our security properties (C1 single-use
 * nonce, C2 per-user binding, origin binding, under-18 rejection).
 *
 * The mock "wallet" uses a TEST trust anchor we generate here; production points
 * GOOGLE_WALLET_IACA_PEM at Google's real sandbox root. The verifier code path is identical.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { webcrypto } from 'node:crypto';
import * as x509 from '@peculiar/x509';
import { calculateJwkThumbprint } from 'jose';
import {
  CoseKey,
  DeviceKey,
  SessionTranscript,
  Document,
  DeviceResponse,
  IssuerSignedBuilder,
  DeviceSignedBuilder,
} from '@owf/mdoc';
import { nodeMdocContext } from './mdoc-context';
import { buildAgeRequest, verifyAgeResponse, type BuiltAgeRequest } from './oid4vp';
import { issueNonce, consumeNonce } from './nonce-store';
import type { WalletProviderConfig } from './config';

const subtle = webcrypto.subtle;
x509.cryptoProvider.set(webcrypto as unknown as Crypto);

const EC: EcKeyGenParams = { name: 'ECDSA', namedCurve: 'P-256' };
const SIG: EcdsaParams = { name: 'ECDSA', hash: 'SHA-256' };
const DOCTYPE = 'org.iso.18013.5.1.mDL';
const NAMESPACE = 'org.iso.18013.5.1';
const ORIGIN = 'http://localhost:9002';
const USER_ID = 'user-under-test';

// A signing-capable mdoc context (the production context only verifies — its sign() throws).
const signingCtx = {
  ...nodeMdocContext,
  cose: {
    sign1: {
      sign: async ({ toBeSigned, key }: { toBeSigned: Uint8Array; key: CoseKey }) => {
        const jwk = key.jwk as JsonWebKey;
        const priv = await subtle.importKey('jwk', { kty: 'EC', crv: 'P-256', x: jwk.x, y: jwk.y, d: jwk.d }, EC, false, ['sign']);
        return new Uint8Array(await subtle.sign(SIG, priv, toBeSigned as Uint8Array));
      },
      verify: nodeMdocContext.cose.sign1.verify,
    },
    mac0: {
      sign: async ({ toBeAuthenticated, key }: { toBeAuthenticated: Uint8Array; key: CoseKey }) => {
        const jwk = key.jwk as JsonWebKey;
        const raw = Buffer.from(jwk.k as string, 'base64url');
        const hmac = await subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return new Uint8Array(await subtle.sign('HMAC', hmac, toBeAuthenticated as Uint8Array));
      },
      verify: nodeMdocContext.cose.mac0.verify,
    },
  },
};

function toPem(der: ArrayBuffer, label: string): string {
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN ${label}-----\n${b64}\n-----END ${label}-----`;
}
async function coseFrom(key: CryptoKey): Promise<CoseKey> {
  return CoseKey.fromJwk((await subtle.exportKey('jwk', key)) as Record<string, unknown>);
}

// ── Test PKI + config, built once ──
let cfg: WalletProviderConfig;
let dsCoseKey: CoseKey;           // document-signer private key (signs the MSO)
let dsCertDer: Uint8Array;        // document-signer cert (chains to IACA)
let deviceCertDer: Uint8Array;    // holder device cert
let devicePrivCose: CoseKey;      // holder device private key (signs DeviceAuth)
let devicePubCose: CoseKey;       // holder device public key (goes in the MSO)

beforeAll(async () => {
  process.env.SESSION_SECRET = 'test-session-secret-1234567890';

  const now = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 365 * 24 * 3600_000);

  // IACA root (CA), document signer (signed by IACA), reader RP cert (self-signed).
  const iacaKeys = await subtle.generateKey(EC, true, ['sign', 'verify']);
  const iacaCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '01', name: 'C=US, CN=TEST IACA Root', notBefore: now, notAfter: future,
    keys: iacaKeys, signingAlgorithm: SIG,
    extensions: [new x509.BasicConstraintsExtension(true, 1, true)],
  });

  const dsKeys = await subtle.generateKey(EC, true, ['sign', 'verify']);
  const dsCert = await x509.X509CertificateGenerator.create({
    serialNumber: '02', subject: 'C=US, CN=TEST Document Signer', issuer: iacaCert.subject,
    notBefore: now, notAfter: future, publicKey: dsKeys.publicKey, signingKey: iacaKeys.privateKey,
    signingAlgorithm: SIG, extensions: [new x509.BasicConstraintsExtension(false)],
  });
  dsCoseKey = await coseFrom(dsKeys.privateKey);
  dsCertDer = new Uint8Array(dsCert.rawData);

  const readerKeys = await subtle.generateKey(EC, true, ['sign', 'verify']);
  const readerCert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: '03', name: 'CN=TEST Reader RP', notBefore: now, notAfter: future,
    keys: readerKeys, signingAlgorithm: SIG,
  });
  const readerKeyPem = toPem(await subtle.exportKey('pkcs8', readerKeys.privateKey), 'PRIVATE KEY');

  // Holder device key + a cert for the DeviceAuth x5chain slot.
  const deviceKeys = await subtle.generateKey(EC, true, ['sign', 'verify']);
  const deviceCert = await x509.X509CertificateGenerator.create({
    serialNumber: '04', subject: 'C=US, CN=TEST Device', issuer: iacaCert.subject,
    notBefore: now, notAfter: future, publicKey: deviceKeys.publicKey, signingKey: iacaKeys.privateKey,
    signingAlgorithm: SIG, extensions: [new x509.BasicConstraintsExtension(false)],
  });
  deviceCertDer = new Uint8Array(deviceCert.rawData);
  devicePrivCose = await coseFrom(deviceKeys.privateKey);
  devicePubCose = await coseFrom(deviceKeys.publicKey);

  cfg = {
    rpId: 'x509_hash:test',
    readerKeyPem,
    readerCertPem: readerCert.toString('pem'),
    iacaPems: [iacaCert.toString('pem')],
    doctype: DOCTYPE,
    namespace: NAMESPACE,
  };
});

/** Acts as the wallet: mint a DeviceResponse bound to `built`'s request + `origin`. */
async function mintAttestation(built: BuiltAgeRequest, origin: string, ageOver18: boolean) {
  // Pull the ephemeral encryption public key + nonce from the (public) signed request JWT.
  const reqData = (built.request as { data: string }).data;
  const payload = JSON.parse(Buffer.from(reqData.split('.')[1], 'base64url').toString());
  const ephemeralPubJwk = payload.client_metadata.jwks.keys[0];
  const nonce: string = payload.nonce;

  const thumb = await calculateJwkThumbprint(ephemeralPubJwk, 'sha256');
  const transcript = await SessionTranscript.forOid4VpDcApi(
    { origin, nonce, jwkThumbprint: new Uint8Array(Buffer.from(thumb, 'base64url')) },
    nodeMdocContext,
  );

  const now = new Date(Date.now() - 60_000);
  const future = new Date(Date.now() + 365 * 24 * 3600_000);

  const issuerSigned = await new IssuerSignedBuilder(DOCTYPE, signingCtx)
    .addIssuerNamespace(NAMESPACE, { age_over_18: ageOver18 })
    .sign({
      signingKey: dsCoseKey,
      algorithm: -7 as never,            // ES256
      digestAlgorithm: 'SHA-256',
      validityInfo: { signed: now, validFrom: now, validUntil: future },
      // deviceKeyInfo.deviceKey must be a DeviceKey instance — round-trip the CoseKey.
      deviceKeyInfo: { deviceKey: DeviceKey.decode(devicePubCose.encode()) },
      certificates: [dsCertDer],
    });

  const deviceSigned = await new DeviceSignedBuilder(DOCTYPE, signingCtx)
    .sign({
      signingKey: devicePrivCose,
      algorithm: -7 as never,
      sessionTranscript: transcript,
      derCertificate: Buffer.from(deviceCertDer).toString('base64'),
    });

  const document = Document.create({ docType: DOCTYPE, issuerSigned, deviceSigned });
  const deviceResponse = DeviceResponse.createSimple({ version: '1.0', status: 0, documents: [document] });
  const vpToken = Buffer.from(deviceResponse.encode()).toString('base64url');
  return { vp_token: { age: vpToken } };
}

describe('age-verification crypto path (mint → verify, no hardware)', () => {
  it('verifies a valid 18+ mdoc end-to-end and reads the claim', async () => {
    const built = await buildAgeRequest(cfg, ORIGIN, USER_ID);
    const attestation = await mintAttestation(built, ORIGIN, true);

    const result = await verifyAgeResponse(cfg, {
      attestation, verifierState: built.verifierState, origin: ORIGIN, expectedUserId: USER_ID,
    });

    expect(result.verified).toBe(true);
    expect(result.docType).toBe(DOCTYPE);
    expect(result.nonce).toBe(built.nonce);
  });

  it('reports verified=false when the credential is not 18+', async () => {
    const built = await buildAgeRequest(cfg, ORIGIN, USER_ID);
    const attestation = await mintAttestation(built, ORIGIN, false);
    const result = await verifyAgeResponse(cfg, {
      attestation, verifierState: built.verifierState, origin: ORIGIN, expectedUserId: USER_ID,
    });
    expect(result.verified).toBe(false);
  });

  it('rejects a response submitted by a different user (C2 binding)', async () => {
    const built = await buildAgeRequest(cfg, ORIGIN, USER_ID);
    const attestation = await mintAttestation(built, ORIGIN, true);
    await expect(verifyAgeResponse(cfg, {
      attestation, verifierState: built.verifierState, origin: ORIGIN, expectedUserId: 'someone-else',
    })).rejects.toThrow(/not bound to this user/i);
  });

  it('rejects an origin mismatch', async () => {
    const built = await buildAgeRequest(cfg, ORIGIN, USER_ID);
    const attestation = await mintAttestation(built, ORIGIN, true);
    await expect(verifyAgeResponse(cfg, {
      attestation, verifierState: built.verifierState, origin: 'https://evil.example', expectedUserId: USER_ID,
    })).rejects.toThrow(/origin mismatch/i);
  });

  it('rejects when the trust anchor does not match the issuer (bad IACA)', async () => {
    const built = await buildAgeRequest(cfg, ORIGIN, USER_ID);
    const attestation = await mintAttestation(built, ORIGIN, true);
    // Swap in a different (unrelated) IACA so the cert chain can't anchor.
    const otherKeys = await subtle.generateKey(EC, true, ['sign', 'verify']);
    const otherIaca = await x509.X509CertificateGenerator.createSelfSigned({
      serialNumber: '09', name: 'C=US, CN=OTHER Root', notBefore: new Date(Date.now() - 60_000),
      notAfter: new Date(Date.now() + 3600_000), keys: otherKeys, signingAlgorithm: SIG,
      extensions: [new x509.BasicConstraintsExtension(true, 1, true)],
    });
    const badCfg = { ...cfg, iacaPems: [otherIaca.toString('pem')] };
    await expect(verifyAgeResponse(badCfg, {
      attestation, verifierState: built.verifierState, origin: ORIGIN, expectedUserId: USER_ID,
    })).rejects.toBeTruthy();
  });
});

describe('single-use nonce store (C1)', () => {
  it('allows one consume, then rejects replay and wrong-user', async () => {
    await issueNonce('nonce-a', 'u1', 600);
    expect(await consumeNonce('nonce-a', 'u1')).toBe(true);  // first use
    expect(await consumeNonce('nonce-a', 'u1')).toBe(false); // replay
    await issueNonce('nonce-b', 'u1', 600);
    expect(await consumeNonce('nonce-b', 'u2')).toBe(false); // bound to u1
  });
});
