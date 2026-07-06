import 'server-only';
/**
 * App Attest (iOS age-gate anti-forgery, issue #32).
 *
 * The Declared Age Range result is an unsigned OS value — a script could POST
 * `over18: true` to the submit action. App Attest closes that: the app holds a
 * Secure-Enclave key that Apple attests belongs to a genuine, unmodified instance of
 * THIS app, and it signs each age submission with that key. The signed bytes are
 * SHA256 of the CANONICAL PAYLOAD (nonce + over18 + declaration + parental-controls —
 * see @/lib/age-verification/app-attest-payload), so the assertion covers the claim
 * set itself: tampering with any submitted field invalidates the signature, not just
 * reuse of the nonce.
 *
 * Two phases, both server-verified here (crypto via `appattest-checker-node`):
 *   1. REGISTER (once/device): verify the attestation object, store the public key.
 *   2. ASSERT (per submission): verify the assertion signature over SHA256(payload)
 *      with the stored key, and enforce the monotonic sign counter (anti-replay).
 *
 * When enabled (IOS_AGE_APP_ATTEST_ENABLED), this is enforced on staging AND prod —
 * TestFlight builds use the production attestation environment, so staging is protected
 * too. Local dev / simulator can't attest; those use the dev stub (non-prod only).
 */
import { createHash } from 'crypto';
import { verifyAttestation, verifyAssertion } from 'appattest-checker-node';

/** Master switch: when true, the age provider REQUIRES a valid App Attest assertion. */
export function iosAppAttestEnabled(): boolean {
  return process.env.IOS_AGE_APP_ATTEST_ENABLED === 'true';
}

/** App id Apple attests against: "<10-char team id>.<bundle id>". */
function appId(): string {
  const id = process.env.APPLE_APP_ATTEST_APP_ID;
  if (!id) throw new Error('APPLE_APP_ATTEST_APP_ID is not configured.');
  return id;
}

/** Attestation environment. TestFlight/App Store builds attest in `production`; only a
 *  Xcode-signed dev build uses `development`. Defaults to production. */
function developmentEnv(): boolean {
  return process.env.APPLE_APP_ATTEST_ENV === 'development';
}

const sha256 = (s: string): Buffer => createHash('sha256').update(s, 'utf8').digest();

// ── Storage ─────────────────────────────────────────────────────────────────
async function getDb() {
  const { db } = await import('@/db');
  const { appAttestKeys } = await import('@/db/schema');
  const { eq, and } = await import('drizzle-orm');
  return { db, appAttestKeys, eq, and };
}

/**
 * Register a device's attested key. Verifies the attestation object against the
 * single-use `challenge`, then persists the public key under `keyId` for this user.
 * Throws on any verification failure. Idempotent per keyId (re-register overwrites).
 */
export async function registerAttestedKey(input: {
  keyId: string;
  userId: string;
  challenge: string;
  attestationBase64: string;
}): Promise<void> {
  const result = await verifyAttestation(
    { appId: appId(), developmentEnv: developmentEnv() },
    input.keyId,
    Buffer.from(input.challenge, 'utf8'),
    Buffer.from(input.attestationBase64, 'base64'),
  );
  if ('verifyError' in result) {
    throw new Error(`App Attest attestation failed: ${result.verifyError}`);
  }
  const { db, appAttestKeys } = await getDb();
  await db
    .insert(appAttestKeys)
    .values({
      keyId: input.keyId,
      userId: input.userId,
      publicKeyPem: result.publicKeyPem,
      receipt: result.receipt.toString('base64'),
      signCount: 0,
    })
    .onConflictDoUpdate({
      target: appAttestKeys.keyId,
      // Re-attesting the same key rotates the stored public key + resets the counter,
      // but only for the SAME owning user (guarded below on the read path too).
      set: { publicKeyPem: result.publicKeyPem, receipt: result.receipt.toString('base64'), signCount: 0, userId: input.userId },
    });
}

/**
 * Verify an age submission's App Attest assertion. Throws unless the assertion is a
 * valid signature over SHA256(payload) by a key REGISTERED TO THIS USER, with a
 * strictly increasing sign counter. `payload` is the canonical claim string
 * (buildAppAttestPayload) rebuilt server-side from the SUBMITTED fields — so a valid
 * signature proves a genuine app instance produced exactly these claims.
 * On success, persists the new counter.
 */
export async function assertAttestation(input: {
  keyId?: string;
  assertionBase64?: string;
  payload: string;
  userId: string;
}): Promise<void> {
  if (!input.keyId || !input.assertionBase64) {
    throw new Error('App Attest assertion missing (keyId/assertion). Update the app and retry.');
  }
  const { db, appAttestKeys, eq, and } = await getDb();
  const [row] = await db
    .select({ publicKeyPem: appAttestKeys.publicKeyPem, signCount: appAttestKeys.signCount })
    .from(appAttestKeys)
    .where(and(eq(appAttestKeys.keyId, input.keyId), eq(appAttestKeys.userId, input.userId)))
    .limit(1);
  if (!row) {
    // Key unknown OR not owned by this user — never verify one account with another's key.
    throw new Error('App Attest key is not registered for this account.');
  }

  const result = await verifyAssertion(
    sha256(input.payload),         // clientDataHash — MUST match what the device signed
    row.publicKeyPem,
    appId(),
    Buffer.from(input.assertionBase64, 'base64'),
  );
  if ('verifyError' in result) {
    throw new Error(`App Attest assertion failed: ${result.verifyError}`);
  }
  // Anti-replay: the counter must strictly increase. The guard is enforced in the
  // UPDATE's WHERE clause (compare-and-set), so two concurrent submissions replaying
  // the same assertion can't both pass off a stale read — only one row-update wins.
  if (result.signCount <= row.signCount) {
    throw new Error('App Attest assertion replayed (sign counter did not advance).');
  }
  const { lt } = await import('drizzle-orm');
  const updated = await db
    .update(appAttestKeys)
    .set({ signCount: result.signCount, lastUsedAt: new Date() })
    .where(and(eq(appAttestKeys.keyId, input.keyId), lt(appAttestKeys.signCount, result.signCount)))
    .returning({ keyId: appAttestKeys.keyId });
  if (updated.length === 0) {
    throw new Error('App Attest assertion replayed (sign counter did not advance).');
  }
}
