/**
 * @fileoverview Node implementation of @owf/mdoc's pluggable `MdocContext` (issue #32).
 *
 * @owf/mdoc deliberately ships no Node crypto bindings — the consumer supplies COSE,
 * X.509 and crypto primitives. This implements them on node:crypto (X509Certificate +
 * WebCrypto) plus the library's own CoseKey<->JWK accessors. No extra dependencies.
 *
 * ⚠️ This is security-critical and cannot be unit-tested without a real wallet device
 * response. It is written to spec (ISO 18013-5 COSE_Sign1 / mdoc) but MUST be validated
 * with a live Google Wallet sandbox round-trip before production. See
 * docs/plan-wallet-age-verification.md.
 */
import { webcrypto, X509Certificate, createHash } from 'node:crypto';
import { CoseKey } from '@owf/mdoc';
import type { MdocContext } from '@owf/mdoc';

const subtle = webcrypto.subtle;

/** COSE alg (protected header) → WebCrypto hash. ES256/384/512. */
function hashForCoseAlg(alg: number | undefined): string {
  switch (alg) {
    case -35: return 'SHA-384'; // ES384
    case -36: return 'SHA-512'; // ES512
    case -7:
    default: return 'SHA-256'; // ES256
  }
}

function namedCurveForCrv(crv: unknown): string {
  switch (crv) {
    case 2: case 'P-384': return 'P-384';
    case 3: case 'P-521': return 'P-521';
    case 1: case 'P-256': default: return 'P-256';
  }
}

async function importEcdsaPublicKey(coseKey: CoseKey): Promise<CryptoKey> {
  const jwk = coseKey.jwk as JsonWebKey;
  return subtle.importKey(
    'jwk',
    { kty: 'EC', crv: namedCurveForCrv(coseKey.curve), x: jwk.x, y: jwk.y },
    { name: 'ECDSA', namedCurve: namedCurveForCrv(coseKey.curve) },
    false,
    ['verify'],
  );
}

export const nodeMdocContext: Pick<MdocContext, 'crypto' | 'cose' | 'x509'> = {
  crypto: {
    random: (length: number) => webcrypto.getRandomValues(new Uint8Array(length)),
    digest: async ({ digestAlgorithm, bytes }) => {
      const algMap: Record<string, string> = { 'SHA-256': 'SHA-256', 'SHA-384': 'SHA-384', 'SHA-512': 'SHA-512' };
      const alg = algMap[digestAlgorithm as string] ?? 'SHA-256';
      return new Uint8Array(await subtle.digest(alg, bytes as Uint8Array));
    },
    // ECDH + HKDF to derive the session MAC key. Only used for MAC-authenticated device
    // responses; OID4VP wallet responses use COSE_Sign1, so this path is rarely hit.
    calculateEphemeralMacKey: async ({ privateKey, publicKey, sessionTranscriptBytes, info }) => {
      const priv = await subtle.importKey('pkcs8', privateKey as Uint8Array, { name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
      const pub = await subtle.importKey('spki', publicKey as Uint8Array, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
      const shared = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: pub }, priv, 256));
      const salt = new Uint8Array(await subtle.digest('SHA-256', sessionTranscriptBytes as Uint8Array));
      const hkdfKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveBits']);
      const derived = new Uint8Array(await subtle.deriveBits(
        { name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) },
        hkdfKey,
        256,
      ));
      return CoseKey.fromJwk({
        kty: 'oct',
        k: Buffer.from(derived).toString('base64url'),
        alg: 'HS256',
      });
    },
  },

  cose: {
    sign1: {
      sign: () => { throw new Error('COSE signing is not implemented on the verifier.'); },
      verify: async ({ key, sign1 }) => {
        try {
          const pub = await importEcdsaPublicKey(key);
          const alg = sign1.protectedHeaders?.headers?.get(1) as number | undefined;
          return await subtle.verify(
            { name: 'ECDSA', hash: hashForCoseAlg(alg) },
            pub,
            sign1.signature as Uint8Array,
            sign1.toBeSigned as Uint8Array,
          );
        } catch {
          return false;
        }
      },
    },
    mac0: {
      sign: () => { throw new Error('COSE MAC signing is not implemented on the verifier.'); },
      verify: async ({ mac0, key }) => {
        try {
          const jwk = key.jwk as JsonWebKey;
          const raw = jwk.k ? Buffer.from(jwk.k, 'base64url') : (key.k as Uint8Array);
          const hmacKey = await subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
          return await subtle.verify('HMAC', hmacKey, mac0.tag as Uint8Array, mac0.toBeAuthenticated as Uint8Array);
        } catch {
          return false;
        }
      },
    },
  },

  x509: {
    getIssuerNameField: ({ certificate, field }) => {
      const cert = new X509Certificate(Buffer.from(certificate as Uint8Array));
      // issuer is a newline-separated "CN=...\nC=..." string
      return cert.issuer
        .split('\n')
        .filter((line) => line.startsWith(`${field}=`))
        .map((line) => line.slice(field.length + 1));
    },
    getPublicKey: async ({ certificate }) => {
      const cert = new X509Certificate(Buffer.from(certificate as Uint8Array));
      const jwk = cert.publicKey.export({ format: 'jwk' }) as JsonWebKey;
      return CoseKey.fromJwk(jwk as Record<string, unknown>);
    },
    verifyCertificateChain: async ({ trustedCertificates, x5chain, now }) => {
      if (!x5chain || x5chain.length === 0) throw new Error('Empty x5chain.');
      const at = now ?? new Date();
      const chain = x5chain.map((der) => new X509Certificate(Buffer.from(der as Uint8Array)));
      const trusted = (trustedCertificates ?? []).map((der) => new X509Certificate(Buffer.from(der as Uint8Array)));

      // Validity window for every cert in the presented chain.
      for (const c of chain) {
        if (at < new Date(c.validFrom) || at > new Date(c.validTo)) {
          throw new Error('Certificate outside its validity window.');
        }
      }
      // Each cert must be issued+signed by the next one in the chain.
      for (let i = 0; i < chain.length - 1; i++) {
        const child = chain[i];
        const parent = chain[i + 1];
        if (!child.checkIssued(parent) || !child.verify(parent.publicKey)) {
          throw new Error('Broken certificate chain link.');
        }
      }
      // The chain's terminal cert must chain to (or equal) a trusted anchor.
      const top = chain[chain.length - 1];
      const anchored = trusted.some((root) => {
        try {
          return top.fingerprint256 === root.fingerprint256 || (top.checkIssued(root) && top.verify(root.publicKey));
        } catch {
          return false;
        }
      });
      if (!anchored) throw new Error('Certificate chain does not terminate in a trusted anchor.');
    },
    getCertificateData: async ({ certificate }) => {
      const der = Buffer.from(certificate as Uint8Array);
      const cert = new X509Certificate(der);
      return {
        issuerName: cert.issuer,
        subjectName: cert.subject,
        serialNumber: cert.serialNumber,
        thumbprint: createHash('sha256').update(der).digest('hex'),
        notBefore: new Date(cert.validFrom),
        notAfter: new Date(cert.validTo),
        pem: cert.toString(),
      };
    },
  },
};

/** Parse one or more PEM certs into DER byte arrays for trustedCertificates. */
export function pemCertsToDer(pems: string[]): Uint8Array[] {
  return pems.map((pem) => new Uint8Array(new X509Certificate(pem).raw));
}
