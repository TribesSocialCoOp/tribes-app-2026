/**
 * Client helper for the 18+ age gate (issue #32).
 * The join flow signals the gate via a typed status ('age_required'); the create
 * flow throws a PublicError carrying this sentinel. isAgeGateError() detects the
 * latter from whatever shape the error surfaces as (Error, {serverError}, string).
 */
export const AGE_GATE_SENTINEL = 'AGE_VERIFICATION_REQUIRED';

export function isAgeGateError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === 'string') return error.includes(AGE_GATE_SENTINEL);
  if (error instanceof Error) return error.message.includes(AGE_GATE_SENTINEL);
  if (typeof error === 'object') {
    const anyErr = error as Record<string, unknown>;
    const candidates = [anyErr.serverError, anyErr.message, anyErr.error];
    return candidates.some((c) => typeof c === 'string' && c.includes(AGE_GATE_SENTINEL));
  }
  return false;
}
