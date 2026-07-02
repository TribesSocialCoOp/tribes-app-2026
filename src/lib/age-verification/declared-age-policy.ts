/**
 * Shared policy constants for Apple's Declared Age Range (issue #32) — imported by BOTH
 * the server provider (providers/apple-declared-age.ts) and the client pre-check
 * (client.ts), so the two can't drift. Deliberately NOT in ios-declared-age.ts (that
 * file is documented as a client-only bridge — window/Capacitor access — and must never
 * become a server-code dependency).
 */

/**
 * Declaration levels that count as high-assurance ("confirmed") for a US law state.
 * Bare self-declaration is the SAME assurance as the web opt-in we geo-block those
 * states to avoid, so it is NOT accepted; `other`/guardian variants are excluded
 * conservatively. ⚠️ Confirm this set with counsel before prod (Decision 2).
 */
export const CONFIRMED_AGE_DECLARATIONS: ReadonlySet<string> = new Set(['government_id', 'payment']);

/**
 * User-facing guidance for the self-declared case: the account says 18+, but Apple
 * hasn't confirmed it. Steps per Apple Support (support.apple.com/125662): iOS can
 * confirm adulthood from account history, a credit card, or a government ID / passport
 * (region-dependent) — Apple shares only the RESULT with us, never the document.
 */
export const UNCONFIRMED_AGE_GUIDANCE =
  'Your Apple Account lists you as 18+, but Apple hasn’t confirmed it yet. ' +
  'On your iPhone, open Settings → your name → Personal Information and confirm your age — ' +
  'Apple can confirm it from your account history, a credit card, or an ID, and only ever ' +
  'shares the result with us (never your documents or birthdate). Then try again here.';
