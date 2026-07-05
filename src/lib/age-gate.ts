/**
 * Client helper for the 18+ age gate (issue #32).
 * The join flow signals the gate via a typed status ('age_required'); the create
 * flow throws a PublicError carrying this sentinel. isAgeGateError() detects the
 * latter from whatever shape the error surfaces as (Error, {serverError}, string).
 */
export const AGE_GATE_SENTINEL = 'AGE_VERIFICATION_REQUIRED';
/** NSFW needs the web-set self-attest opt-in (the user hasn't enabled adult content). */
export const NSFW_OPT_IN_SENTINEL = 'NSFW_OPT_IN_REQUIRED';
/** NSFW is geo-blocked in the caller's region — no trusted verification method (e.g. UK).
 *  (Law states like KS/WY/SD are 'verify' via Google Wallet, not blocked.) */
export const NSFW_BLOCKED_SENTINEL = 'NSFW_REGION_BLOCKED';

/** True if `error` (Error | {serverError|message|error} | string) carries `sentinel`. */
export function errorCarries(error: unknown, sentinel: string): boolean {
  if (!error) return false;
  if (typeof error === 'string') return error.includes(sentinel);
  if (error instanceof Error) return error.message.includes(sentinel);
  if (typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    return [anyErr.serverError, anyErr.message, anyErr.error]
      .some((c) => typeof c === 'string' && c.includes(sentinel));
  }
  return false;
}

export const isAgeGateError = (error: unknown) => errorCarries(error, AGE_GATE_SENTINEL);
export const isNsfwOptInError = (error: unknown) => errorCarries(error, NSFW_OPT_IN_SENTINEL);
export const isNsfwBlockedError = (error: unknown) => errorCarries(error, NSFW_BLOCKED_SENTINEL);

/** Shared user copy for a geo-blocked region (age-verification dialog + tribe gate card). */
export const NSFW_BLOCKED_REGION_TITLE = 'Not available in your region';
export const NSFW_BLOCKED_REGION_COPY =
  'Adult content isn’t available where you are right now. Some regions require ' +
  'age-verification methods we don’t currently support. This reflects local law, ' +
  'not a judgment — and it may change as those options improve.';

/**
 * Join-flow statuses (returned by requestToJoinTribe) that require the age-gate modal
 * — verification, opt-in, or region-blocked. The unified modal figures out which to show.
 */
export type AgeGateJoinStatus = 'age_required' | 'opt_in_required' | 'region_blocked';
export function isAgeGateStatus(status: unknown): status is AgeGateJoinStatus {
  return status === 'age_required' || status === 'opt_in_required' || status === 'region_blocked';
}
