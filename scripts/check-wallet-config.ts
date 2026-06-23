/**
 * Pre-flight validator for wallet age-verification env (issue #32).
 *
 * Confirms the GOOGLE_WALLET_* / APPLE_WALLET_* keys are present and *parseable*
 * the same way the server does — so you catch format problems (the classic one:
 * a SEC1 key where PKCS#8 is required) BEFORE the live wallet round-trip.
 *
 *   npx tsx --env-file-if-exists=.env.local scripts/check-wallet-config.ts          # google
 *   npx tsx --env-file-if-exists=.env.local scripts/check-wallet-config.ts apple
 *   npm run check:wallet -- apple
 *
 * Exit code 0 = good to test; 1 = fix the ✗ items.
 */
import { importPKCS8 } from 'jose';
import { X509Certificate, createHash } from 'node:crypto';
import { loadWalletConfig } from '../src/lib/services/age-verification/config';

const which = (process.argv[2] || 'google').toLowerCase();
const prefix: 'GOOGLE_WALLET' | 'APPLE_WALLET' = which === 'apple' ? 'APPLE_WALLET' : 'GOOGLE_WALLET';

async function main() {
  console.log(`\nChecking ${prefix} config…\n`);

  const cfg = loadWalletConfig(prefix);
  if (!cfg) {
    console.error(`✗ ${prefix}: NOT fully configured → provider is UNAVAILABLE (button won't show).`);
    console.error(`  Required: ${prefix}_RP_ID, ${prefix}_READER_KEY_PEM, ${prefix}_READER_CERT_PEM, ${prefix}_IACA_PEM (>=1 CERTIFICATE block).`);
    process.exit(1);
  }

  let ok = true;

  // 1. Reader private key — must import as PKCS#8 ES256 (this is the #1 gotcha).
  try {
    await importPKCS8(cfg.readerKeyPem, 'ES256');
    console.log('✓ READER_KEY_PEM imports as PKCS#8 / ES256');
  } catch {
    ok = false;
    console.error('✗ READER_KEY_PEM did NOT import as PKCS#8 ES256.');
    if (cfg.readerKeyPem.includes('EC PRIVATE KEY')) {
      console.error('  → It is SEC1 ("BEGIN EC PRIVATE KEY"). Convert to PKCS#8:');
      console.error('    openssl pkcs8 -topk8 -nocrypt -in your-key.pem -out your-key.pkcs8.pem');
    } else {
      console.error('  → Expected a "-----BEGIN PRIVATE KEY-----" (PKCS#8) EC P-256 key.');
    }
  }

  // 2. Reader certificate — must parse as X.509.
  let cert: X509Certificate | null = null;
  try {
    cert = new X509Certificate(cfg.readerCertPem);
    console.log(`✓ READER_CERT_PEM parses (subject: ${cert.subject.replace(/\n/g, ' ')})`);
  } catch {
    ok = false;
    console.error('✗ READER_CERT_PEM did not parse as an X.509 certificate.');
  }

  // 3. IACA trust anchors — at least one parseable CERTIFICATE block.
  console.log(`✓ IACA_PEM: ${cfg.iacaPems.length} trust-anchor cert block(s) detected`);
  cfg.iacaPems.forEach((pem, i) => {
    try { new X509Certificate(pem); }
    catch { ok = false; console.error(`✗ IACA cert #${i + 1} did not parse.`); }
  });

  // 4. RP_ID sanity (informational — Google specifies the exact client_id).
  if (cert) {
    const sha = createHash('sha256').update(cert.raw).digest();
    if (cfg.rpId === sha.toString('base64url') || cfg.rpId === sha.toString('hex')) {
      console.log('✓ RP_ID matches sha256(cert) (base64url/hex)');
    } else {
      console.log(`• RP_ID = ${cfg.rpId.slice(0, 24)}… does not match sha256(cert) — may be fine, just confirm it's exactly the client_id Google issued.`);
    }
  }

  console.log(`\n  doctype=${cfg.doctype}  namespace=${cfg.namespace}  rpMetadata=${cfg.rpMetadataB64 ? 'set' : 'unset'}`);
  console.log(ok
    ? '\nRESULT: ✓ Config is valid and parseable — the "Verify with Google Wallet" button will appear.\n'
    : '\nRESULT: ✗ Fix the ✗ items above, then re-run.\n');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
