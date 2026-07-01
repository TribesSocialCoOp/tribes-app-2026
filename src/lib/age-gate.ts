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
