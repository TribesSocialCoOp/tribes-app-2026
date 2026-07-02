/**
 * Policy constants for Apple's Declared Age Range (issue #32). These back the OPTIONAL
 * IOS_AGE_REQUIRE_CONFIRMED flag in providers/apple-declared-age.ts — the DEFAULT policy
 * keeps minors out via the age band and does not gate on the declaration method (Apple
 * returns self_declared for most adults). Only consulted when that flag is turned on.
 * Kept in a neutral module (not the client-only ios-declared-age.ts bridge) so server
 * code can import it without pulling in window/Capacitor access.
 */

/**
 * Declaration levels that count as high-assurance ("Apple-confirmed"), used only when
 * IOS_AGE_REQUIRE_CONFIRMED is on. The line: did Apple INDEPENDENTLY verify the age, or
 * did the user just self-report it?
 *   - `self_declared`  → REJECTED. Just a typed birthday; same assurance as the web
 *                        opt-in we geo-block those states to avoid.
 *   - `guardian_declared` → REJECTED. A guardian declaring a range, no check (and
 *                        irrelevant for an adult result anyway).
 *   - `government_id` / `payment` → accepted (gov-ID scan / card verification).
 *   - `other` (Apple's `checkedByOtherMethod`) → ACCEPTED. This is what Apple returns
 *                        when it confirms adulthood from ACCOUNT HISTORY / longevity or
 *                        a card on file — per Apple Support (support.apple.com/125662),
 *                        account tenure is a *confirmation* method, and its Q&A groups
 *                        `checkedByOtherMethod` with the independently-verified levels,
 *                        distinct from `self_declared`. Excluding it (the original bug)
 *                        wrongly rejected every long-standing real account.
 * ⚠️ Whether Apple-confirmed (incl. account-history) satisfies a given state's law is a
 * counsel call — Apple explicitly leaves the policy to the developer.
 */
export const CONFIRMED_AGE_DECLARATIONS: ReadonlySet<string> = new Set([
  'government_id',
  'payment',
  'other', // Apple's checkedByOtherMethod — account history / card-on-file confirmation
]);

/**
 * User-facing guidance for the genuinely self-declared case (account age typed in, never
 * corroborated by Apple). Apple does NOT expose a standalone "confirm my age" button —
 * confirmation happens contextually when you take an age-gated action. The most reliable
 * user-triggerable path is adding a credit card to the Apple Account (Apple confirms from
 * the card; it needn't be kept as a payment method). Apple shares only the RESULT with
 * us, never the card, document, or birthdate.
 */
export const UNCONFIRMED_AGE_GUIDANCE =
  'Your Apple Account lists you as 18+, but Apple hasn’t independently confirmed it. ' +
  'Apple confirms adulthood from a long-standing account, a credit card on file, or a ' +
  'government ID — there’s no single “confirm” button; it happens when you add a card to ' +
  'your Apple Account or complete an ID check. Apple shares only the yes/no with us, never ' +
  'your card, documents, or birthdate. Once confirmed, try again here.';
