/**
 * Canonical App Attest payload string (issue #32) — shared by the client (which asks
 * the Secure Enclave to sign its SHA-256) and the server (which rebuilds it from the
 * submitted fields and verifies the assertion against it).
 *
 * Binding the WHOLE claim set — not just the nonce — is what makes the assertion an
 * attestation of the age result itself: swapping `over18` (or any other field) after
 * signing invalidates the assertion. Privacy: every field here is already part of the
 * submission the server receives; nothing extra is disclosed by signing it.
 *
 * The normalization here MUST stay byte-identical on both sides:
 *   - booleans → '1' / '0', with anything non-`true` (including undefined) as '0'
 *   - declaration → the string as sent, or 'unknown' when absent
 * Bump the leading version tag if the field set ever changes.
 */
export function buildAppAttestPayload(fields: {
  nonce: string;
  over18: unknown;
  declaration: unknown;
  parentalControlsActive: unknown;
}): string {
  const flag = (v: unknown): string => (v === true ? '1' : '0');
  const declaration = typeof fields.declaration === 'string' && fields.declaration !== ''
    ? fields.declaration
    : 'unknown';
  return ['tribes-age-v2', fields.nonce, flag(fields.over18), declaration, flag(fields.parentalControlsActive)].join('|');
}
