/**
 * NSFW age-gate policy (issue #32) — pure decision logic, no I/O (easily testable).
 *
 * Model: self-attest everywhere via a web-set 18+ opt-in, EXCEPT a small set of
 * jurisdictions whose age laws catch us regardless of content ratio — those are
 * geo-blocked. Optional Google Wallet ZKP can also satisfy the gate. We never
 * collect government ID. See docs/plan-age-geo-policy.md.
 */

export type Surface = 'web' | 'ios' | 'android';
export type NsfwDecision = 'allow' | 'needs_optin' | 'blocked';

export interface NsfwAccess {
  decision: NsfwDecision;
  /** Machine reason code (for logging / client branching). */
  reason: 'not_nsfw' | 'self_attested' | 'verified' | 'opt_in_required' | 'region_law';
  /** Hint for the client UI on how to lead the user to a solution. */
  remediation?: 'enable_on_web_here' | 'enable_on_web_elsewhere' | 'unavailable_in_region';
}

/**
 * Jurisdictions where self-attestation is NOT lawful for us and we don't yet verify,
 * so NSFW is geo-blocked. These are the no/low-threshold laws that apply regardless
 * of our (sub-1/3) content ratio. The ~1/3-threshold states are intentionally absent
 * (they exempt a platform under one-third → self-attest there).
 *
 * Codes are ISO 3166-1 alpha-2 country, or `<country>-<subdivision>` (ISO 3166-2).
 * ⚠️ Tune with counsel; reversible once we add a privacy-clean verification method.
 */
export const BLOCKED_REGIONS: readonly string[] = [
  'US-KS', // Kansas — 25% threshold measured by page-views (+ $50k statutory private damages)
  'US-WY', // Wyoming — no threshold ("any amount"), private right of action
  'US-SD', // South Dakota — no threshold, criminal exposure
  'GB',    // United Kingdom — Online Safety Act HEAA (block is Ofcom's accepted last resort)
];

/** True if a resolved region code (e.g. 'US-KS' or 'GB-ENG') is on the block list. */
export function isBlockedRegion(code: string): boolean {
  if (!code) return false;                       // unknown → not blocked (permissive default)
  if (BLOCKED_REGIONS.includes(code)) return true;
  const country = code.split('-')[0];            // block whole country if listed (e.g. 'GB' blocks 'GB-ENG')
  return BLOCKED_REGIONS.includes(country);
}

/**
 * Decide whether a user may access NSFW content here. Pure: caller supplies the
 * resolved region/surface/flags. Decision is the STRICTER of region + opt-in state.
 */
export function resolveNsfwAccess(input: {
  isNsfw: boolean;
  hasOptIn: boolean;     // users.showAdultContentAt set (web self-attestation)
  hasVerified: boolean;  // users.ageVerifiedAt set (optional stronger verify)
  regionCode: string;
  surface: Surface;
}): NsfwAccess {
  if (!input.isNsfw) return { decision: 'allow', reason: 'not_nsfw' };

  // Geo-block takes precedence: not available here regardless of opt-in.
  if (isBlockedRegion(input.regionCode)) {
    return { decision: 'blocked', reason: 'region_law', remediation: 'unavailable_in_region' };
  }

  if (input.hasVerified) return { decision: 'allow', reason: 'verified' };
  if (input.hasOptIn) return { decision: 'allow', reason: 'self_attested' };

  // Not opted in. The opt-in is web-only (Apple Reddit-pattern), so native apps
  // must send the user to the web to enable it.
  return {
    decision: 'needs_optin',
    reason: 'opt_in_required',
    remediation: input.surface === 'web' ? 'enable_on_web_here' : 'enable_on_web_elsewhere',
  };
}
