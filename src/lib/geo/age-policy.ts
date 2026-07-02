/**
 * NSFW age-gate policy (issue #32) — pure decision logic, no I/O (easily testable).
 *
 * Model: self-attest everywhere via a web-set 18+ opt-in, EXCEPT a small set of
 * jurisdictions whose age laws catch us regardless of content ratio — those are
 * geo-blocked. Optional Google Wallet ZKP can also satisfy the gate. We never
 * collect government ID. See docs/plan-age-geo-policy.md.
 *
 * STAGED ROLLOUT (2026-07): Google Wallet verification is NOT live yet — we can't get
 * production RP credentials until we can device-test it. Stage 1 launches with
 * self-attestation in open regions and GEO-BLOCKS the law states (no trusted
 * verification method to offer them). Stage 2 flips `NEXT_PUBLIC_WALLET_VERIFY_ENABLED`
 * (per-env) to re-open the `verify` tier once Wallet is tested. The VERIFY_REGIONS
 * list is preserved throughout, so re-enabling is just the env flag.
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

/**
 * Stage-2 feature flag: is Google Wallet age-verification live? OFF by default (no prod
 * RP creds until device testing). While off, law-state regions geo-block instead of
 * offering a dead "verify" step. Enable per-env (dev/staging, later prod) to re-open the
 * verify tier and the Google Wallet provider — the two ungate together. Read at call
 * time so tests (and env changes) take effect without a rebuild in Node.
 */
export function walletVerifyEnabled(): boolean {
  return process.env.NEXT_PUBLIC_WALLET_VERIFY_ENABLED === 'true';
}

/**
 * PURE geographic/legal classification, independent of rollout state. `verify` here
 * means "this jurisdiction has an AV law", NOT that verification is currently offered.
 * Use this to reason about the law itself (e.g. list-integrity tests); use
 * {@link regionTier} for what the app actually enforces right now.
 */
export function lawRegionTier(code: string): RegionTier {
  if (!code) return 'open';                          // unknown → permissive default
  const country = code.split('-')[0];
  if (BLOCKED_REGIONS.includes(code) || BLOCKED_REGIONS.includes(country)) return 'blocked';
  if (VERIFY_REGIONS.includes(code)) return 'verify';
  return 'open';
}

/**
 * EFFECTIVE tier the app enforces for this request. While Google Wallet verification is
 * parked (`walletVerifyEnabled() === false`), law-state regions collapse to `blocked` —
 * same UX as the UK — because we have no verification method to offer there yet. Every
 * downstream consumer (server gate, discovery filter, age-gate dialog) keys off this one
 * function, so the block stays consistent across the whole flow.
 */
export function regionTier(code: string): RegionTier {
  const tier = lawRegionTier(code);
  if (tier === 'verify' && !walletVerifyEnabled()) return 'blocked';
  return tier;
}

/**
 * Decide whether a user may access NSFW content here. Pure: caller supplies the
 * resolved region/surface/flags.
 *
 * Two requirements, in order:
 *   - `open` region: just the content toggle (`hasOptIn`, users.showAdultContentAt) —
 *     set on the WEB only, off by default. This IS the 18+ self-attestation.
 *   - `verify` (law-state) region: high-assurance Google Wallet verification
 *     (`hasVerified`) comes FIRST — you must verify before the content toggle can be
 *     enabled — and the web content toggle is still required afterward.
 * Wallet verification proves age but does NOT substitute for the content toggle.
 */
export function resolveNsfwAccess(input: {
  isNsfw: boolean;
  hasOptIn: boolean;     // users.showAdultContentAt set (web self-attestation / content toggle)
  hasVerified: boolean;  // users.ageVerifiedAt set (Google Wallet ZKP, etc.)
  regionCode: string;
  surface: Surface;
}): NsfwAccess {
  const { regionCode, ...rest } = input;
  return resolveNsfwAccessForTier({ ...rest, tier: regionTier(regionCode) });
}

/**
 * Same decision as {@link resolveNsfwAccess}, but from an already-classified region
 * tier — for callers (e.g. the age-gate dialog) that only hold the tier, not the code.
 */
export function resolveNsfwAccessForTier(input: {
  isNsfw: boolean;
  hasOptIn: boolean;
  hasVerified: boolean;
  tier: RegionTier;
  surface: Surface;
}): NsfwAccess {
  if (!input.isNsfw) return { decision: 'allow', reason: 'not_nsfw' };

  const tier = input.tier;
  if (tier === 'blocked') {
    return { decision: 'blocked', reason: 'region_law', remediation: 'unavailable_in_region' };
  }

  // (1) Law-state regions require high-assurance age verification FIRST — you must
  // verify (Google Wallet) before the content toggle can be enabled. NOTE: while Wallet
  // is parked, `regionTier` never yields 'verify' (law states collapse to 'blocked'), so
  // this branch is dormant until NEXT_PUBLIC_WALLET_VERIFY_ENABLED is set.
  if (tier === 'verify' && !input.hasVerified) {
    return { decision: 'needs_verify', reason: 'verify_required', remediation: 'verify_with_wallet' };
  }

  // (2) The web-set content toggle is then required in every non-blocked region. In open
  // regions this IS the 18+ self-attestation; in law regions it's the second step, after
  // verification. It can only be set on the web.
  if (!input.hasOptIn) {
    return {
      decision: 'needs_optin',
      reason: 'opt_in_required',
      remediation: input.surface === 'web' ? 'enable_on_web_here' : 'enable_on_web_elsewhere',
    };
  }

  // Open region (toggle = self-attest) or verify region cleared by wallet → allowed.
  return { decision: 'allow', reason: input.hasVerified ? 'verified' : 'self_attested' };
}
