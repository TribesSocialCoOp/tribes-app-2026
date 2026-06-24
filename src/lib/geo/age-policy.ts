/**
 * NSFW age-gate policy (issue #32) — pure decision logic, no I/O (easily testable).
 *
 * Model: self-attest everywhere via a web-set 18+ opt-in, EXCEPT a small set of
 * jurisdictions whose age laws catch us regardless of content ratio — those are
 * geo-blocked. Optional Google Wallet ZKP can also satisfy the gate. We never
 * collect government ID. See docs/plan-age-geo-policy.md.
 */

export type Surface = 'web' | 'ios' | 'android';
export type NsfwDecision = 'allow' | 'needs_optin' | 'needs_verify' | 'blocked';

export interface NsfwAccess {
  decision: NsfwDecision;
  /** Machine reason code (for logging / client branching). */
  reason: 'not_nsfw' | 'self_attested' | 'verified' | 'opt_in_required' | 'verify_required' | 'region_law';
  /** Hint for the client UI on how to lead the user to a solution. */
  remediation?: 'enable_on_web_here' | 'enable_on_web_elsewhere' | 'verify_with_wallet' | 'unavailable_in_region';
}

/**
 * Three region tiers (codes are ISO 3166-1 alpha-2 country, or `<country>-<subdivision>`):
 *   open    → no AV law: self-attest (web opt-in) suffices.
 *   verify  → a US state with an AV law in effect: the easy route is BLOCKED;
 *             NSFW requires Google Wallet ZKP verification. We do NOT rely on the
 *             1/3 content-threshold exemption — any law state requires verification.
 *   blocked → no verification method we trust (UK OSA HEAA); NSFW fully unavailable.
 *
 * VERIFY_REGIONS: US states with adult-content AV laws in effect (verified June 2026).
 * Includes KS/WY/SD (no/low-threshold) — per policy they require Google Wallet like
 * the rest, not a full block. LA's law is enjoined (Dec 2025) but kept for caution.
 * WV eff. 2026-06-12; IA eff. 2026-07-01.
 *
 * WATCH (not added — don't reach a sub-1/3 foreign small platform per research):
 *   ND SB2380 (device/app-store signal model, not a site duty); EU DSA (small-biz
 *   exempt); Canada S-209 (not law); Australia Phase 2 (risk-tiered); FR/DE/IT/BR
 *   (enforce only vs dedicated porn sites — geo-block as a cheap hedge if ever desired).
 * ⚠️ Fast-moving — review with counsel quarterly; this is config, easy to amend.
 */
export const VERIFY_REGIONS: readonly string[] = [
  'US-AL', 'US-AR', 'US-AZ', 'US-FL', 'US-GA', 'US-IA', 'US-ID', 'US-IN', 'US-KS',
  'US-KY', 'US-LA', 'US-MO', 'US-MS', 'US-MT', 'US-NC', 'US-ND', 'US-NE', 'US-OH',
  'US-OK', 'US-SC', 'US-SD', 'US-TN', 'US-TX', 'US-UT', 'US-VA', 'US-WV', 'US-WY',
];

/** Full block — no privacy-clean verification method we trust. Also reserved for
 *  any future government-ID-only mandate. */
export const BLOCKED_REGIONS: readonly string[] = [
  'GB', // United Kingdom — Online Safety Act HEAA; no confirmed Google Wallet route
];

export type RegionTier = 'open' | 'verify' | 'blocked';

/** Classify a resolved region code (e.g. 'US-KS', 'GB-ENG', '') into a tier. */
export function regionTier(code: string): RegionTier {
  if (!code) return 'open';                          // unknown → permissive default
  const country = code.split('-')[0];
  if (BLOCKED_REGIONS.includes(code) || BLOCKED_REGIONS.includes(country)) return 'blocked';
  if (VERIFY_REGIONS.includes(code)) return 'verify';
  return 'open';
}

/**
 * Decide whether a user may access NSFW content here. Pure: caller supplies the
 * resolved region/surface/flags. Wallet verification satisfies every tier; the
 * web self-attest opt-in only satisfies the `open` tier.
 */
export function resolveNsfwAccess(input: {
  isNsfw: boolean;
  hasOptIn: boolean;     // users.showAdultContentAt set (web self-attestation)
  hasVerified: boolean;  // users.ageVerifiedAt set (Google Wallet ZKP, etc.)
  regionCode: string;
  surface: Surface;
}): NsfwAccess {
  if (!input.isNsfw) return { decision: 'allow', reason: 'not_nsfw' };

  const tier = regionTier(input.regionCode);
  if (tier === 'blocked') {
    return { decision: 'blocked', reason: 'region_law', remediation: 'unavailable_in_region' };
  }

  // Wallet verification clears every (non-blocked) tier.
  if (input.hasVerified) return { decision: 'allow', reason: 'verified' };

  if (tier === 'verify') {
    // Law state: self-attest is NOT enough — require Google Wallet verification.
    return { decision: 'needs_verify', reason: 'verify_required', remediation: 'verify_with_wallet' };
  }

  // Open region: the web-set self-attest opt-in suffices.
  if (input.hasOptIn) return { decision: 'allow', reason: 'self_attested' };
  return {
    decision: 'needs_optin',
    reason: 'opt_in_required',
    remediation: input.surface === 'web' ? 'enable_on_web_here' : 'enable_on_web_elsewhere',
  };
}
