# Plan: Tiered Geo-Policy Age Layer for NSFW Tribes

**Status:** For review (Dustin)
**Goal:** Allow NSFW tribes as a *quiet, optional corner* of Tribes — not a primary driver — with
the lightest lawful touch, scoped by the user's location, never a global ID wall.

> ⚠️ **Not legal advice.** This encodes the *public* legal landscape (June 2026) so the policy is
> easy to tune with counsel. Statuses move fast. Confirm statute text + injunction status before
> relying on any single state, and have a lawyer review the block list and the "wallet satisfies the
> law" assumption.

---

## Design decisions (locked with product owner)

1. **No reliance on the 1/3 content-ratio exemption.** We do *not* track content ratios or bet on
   "we're under one-third." Policy is purely **per-region law status**. (Owner: "I don't want to deal
   with that.")
2. **Tiered by locality:**
   - **Tier 1 — Self-attest** where there's no applicable law.
   - **Tier 2 — Wallet verify (Google Wallet ZKP)** in law-states where a government digital-ID check
     is an acceptable method.
   - **Tier 3 — Geo-block** the aggressive/no-threshold law-states + the UK (and any surface/region
     with no usable method). VPNs are the user's problem, not ours.
3. **The block must be *smart*, not a dumb wall** — it returns a reason + a path to a solution and
   leads the user there (verify here / enable on web / why you're blocked).
4. **Users confirm age once** (once-per-profile), per method.
5. **MiVOLO / self-hosted estimation: out.** Not included.
6. **Privacy:** region is resolved per-request from IP via a *local* database; no IP/region stored.

---

## What this builds on (current code — reviewed)

- Age-gate is currently binary + global: every check is `isNsfw && !ageVerifiedAt`, demanding the
  high-assurance wallet credential everywhere. Enforcement points:
  - **View:** `content-actions.ts → getPostsForTribe` → `requireAgeVerified()`.
  - **Join:** `tribe-service.ts → requestToJoinTribe` (returns `'age_required'`) + `joinTribeDirectly`.
  - **Create:** `tribe-service.ts → createTribe` + `tribe-actions.ts` wrapper.
  - **Central:** `shared.ts → requireAgeVerified()`, `lib/age-gate.ts` (sentinel + `isAgeGateError`).
  - **Client handlers:** `tribes/page.tsx`, `tribe-detail-context.tsx`, `invite/[token]/page.tsx`.
- Schema: `users.ageConfirmedAt` (13+), `users.ageVerifiedAt` (18+ high-assurance). **No lightweight
  self-attest field yet.**
- `rate-limit.ts → getClientIp(headers)` already resolves the client IP (cf-connecting-ip /
  x-forwarded-for / x-real-ip). `Caddyfile` reverse proxy in front.
- The wallet verifier already exists (`oid4vp.ts` + `mdoc-context.ts`, validated by
  `oid4vp-e2e.test.ts`) — it **becomes the Tier-2 engine**.

This plan **replaces the scattered binary checks with one tiered, region-aware resolver.**

---

## Two axes: **surface** × **geo**

NSFW visibility = the **stricter** of the surface rule and the geo rule.

### Surface axis (App Store reality)
Apple permits *incidental* NSFW UGC from a web-based service **only if hidden by default and enabled
via the website, not an in-app toggle** (guideline 1.1.4/1.2; the Reddit/Tumblr/X pattern). Google
Play allows it under similar default-hidden, opt-in, not-promoted rules.

- **Native apps (iOS + Android):** NSFW is **hidden by default**; the "show adult content" opt-in is
  set **on the web** (account settings), never as an in-app toggle. Once set, NSFW renders in-app,
  subject to the geo tier. Keep it incidental + filtered. App likely needs an **18+ rating**.
- **iOS specifically:** there is **no wallet verify path** (no Google Wallet on iOS; Apple Wallet is
  banned for adult; the DC API isn't in WKWebView). So an iOS user in a **Tier-2 or Tier-3** region is
  **blocked** (with the smart explanation), not offered verification.
- **Web:** full surface; hosts the opt-in toggle **and** the Tier-2 "Verify with Google Wallet"
  button (desktop = cross-device QR to phone; Android Chrome = same-device).

### Geo axis (tiers by region)
Resolved per request from client IP → country + US subdivision via a **local MaxMind GeoLite2**
database (no third-party calls, nothing stored). Unknown region → Tier 1 (we only escalate regions we
positively identify).

| Tier | Applies to | Behavior |
|---|---|---|
| **1 — Self-attest** | No applicable law | One-click 18+ opt-in (the web-set flag) → access |
| **2 — Wallet verify** | Law-states where Google Wallet ZKP is acceptable | Require a successful Google Wallet age proof (Android + Chrome). iOS → blocked. |
| **3 — Block** | KS, WY, SD, UK (+ any region with no usable method) | NSFW hidden + smart "not available / why" screen |

---

## Recommended initial policy table (tunable; *confirm with counsel*)

```
# region            tier            note
GB (United Kingdom)  BLOCK           # OSA HEAA; no privacy-compliant method; Ofcom accepts blocking
US-KS                BLOCK           # 25% page-view threshold + $50k statutory private damages
US-WY                BLOCK           # no threshold ("any amount") + private right of action
US-SD                BLOCK           # no threshold + criminal exposure
US-<other AV-law states>  WALLET_VERIFY   # require Google Wallet ZKP (gov digital ID). List tuned w/ counsel.
US-<no-law states, incl. WA>  SELF_ATTEST
EU/EEA               SELF_ATTEST     # small-platform carve-outs; monitor FR/DE national law
DEFAULT (rest)       SELF_ATTEST
```

- The full AV-law state list (≈26, post *Free Speech Coalition v. Paxton*) is data — each line is a
  one-word change between `WALLET_VERIFY` and `BLOCK` as counsel advises.
- **Honest caveat (medium confidence):** whether Google Wallet ZKP *legally satisfies* each state's
  "commercially reasonable" standard isn't settled per-state. Confirm before setting a state to
  `WALLET_VERIFY` rather than `BLOCK`.

---

## The credential reality (why Tier 2 works the way it does)

- **Google Wallet age verification accepts US passports *and* state mDLs** ([Google support](https://support.google.com/wallet/answer/15284332)).
  Passport is **nationwide** — so Tier 2 isn't limited to the ~10 mDL states.
- **Adding an ID to Google Wallet is Android-app-only** (passport needs NFC). **Verifying** with it
  works in **Android Chrome (same-device) and desktop Chrome (cross-device QR → phone)** via the
  Digital Credentials API (default-on Chrome 141) — *not Android-only*.
- **State mDL coverage ≠ AV-law states.** mDL adoption tracks DMV modernization, so most AV-law
  states have no Google mDL. The **passport** is what makes Tier 2 viable across states.
- **iOS:** no Google Wallet; Apple Wallet banned for adult; DC API not in WKWebView → no Tier-2 path.

---

## Data model

- **`users.showAdultContentAt`** (new, nullable timestamp). The **web-set** "show adult content"
  opt-in. Default null = NSFW hidden on every surface. Doubles as (a) Apple's "enabled via your
  website" requirement and (b) the **Tier-1 self-attestation**. **Set only on web.**
- **`users.ageVerifiedAt`** (existing). Set when a **Tier-2 Google Wallet ZKP** verification succeeds.
  Once-per-profile.
- Hierarchy: `ageVerifiedAt` satisfies Tier 1 and Tier 2; `showAdultContentAt` satisfies Tier 1 only.

---

## The smart resolver (replaces all scattered checks)

`resolveNsfwAccess({ tribe, user, region, surface }) → { decision, reason, remediation }`

```
if !tribe.isNsfw                          -> allow
if !user.showAdultContentAt               -> { needs_optin,  "Enable adult content in web Settings" }
switch geoTier(region):
  SELF_ATTEST                             -> allow            # opt-in IS the attestation
  WALLET_VERIFY:
     if user.ageVerifiedAt                -> allow
     else if surface == web/android       -> { needs_verify, "Verify with Google Wallet" + button }
     else (iOS)                           -> { blocked,      "Adult content requires age verification not available on iOS here — use the web" }
  BLOCK                                    -> { blocked,      "Not available in <region> due to <law>. <why/civic link>" }
```

Used at **view / join / create** and in **discovery/search** (NSFW tribes filtered out when the
decision is `blocked`). Client renders the `remediation` as a **graduated gate**, never a dead wall.

---

## Phased implementation

1. **Geo + surface resolution** — `src/lib/geo/resolve-region.ts` (MaxMind GeoLite2 via `getClientIp`,
   dev override env, unknown→Tier 1) + surface detection (Capacitor builds send `X-Tribes-Surface`).
2. **Schema** — additive migration for `users.showAdultContentAt`; web-only opt-in toggle + action.
3. **Policy + resolver** — `src/lib/geo/age-policy.ts` (region→tier table) + `resolveNsfwAccess`;
   refactor the 5 enforcement points to call it.
4. **Tier-2 wiring** — point the "Verify with Google Wallet" path at the existing `oid4vp.ts` verifier
   (Google ZKP); set `ageVerifiedAt` on success.
5. **Smart gate UI** — graduated screens (enable-on-web / verify / blocked-with-why) across the 3
   client handlers + discovery filtering.
6. **Tests** — region×surface×user → decision matrix; verified user always passes; blocked hides
   tribes; iOS-in-law-region → blocked.

---

## Comms / transparency (deferred, non-code)

The blocked screen should **explain *why*** (the specific state/UK law) and link out — framed as
**civic literacy** (understand the policy gating you), non-partisan. Reflects the reality that lawful
access now varies by state line. Park until the layer ships.

---

## Honest caveats

- IP geo is VPN-bypassable; it's a recognized "reasonable measure," and bypass is the user's problem.
- "Wallet ZKP satisfies state law" is not settled per-state — counsel-tune `WALLET_VERIFY` vs `BLOCK`.
- Tier 2 excludes iOS users and anyone without a provisioned Google Wallet credential → they're
  effectively blocked in law-states (by design; the gate explains it).
- GeoLite2 needs a free MaxMind license key + periodic DB refresh (ops).

## Sources
- Apple guidelines 1.1.4/1.2 & age ratings: https://developer.apple.com/app-store/review/guidelines/
- WebKit DC API not in WKWebView: https://webkit.org/blog/17431/online-identity-verification-with-the-digital-credentials-api/
- Reddit NSFW enabled via web: https://support.reddithelp.com/hc/en-us/articles/360061032831
- Google Wallet age verify accepts passport + mDL: https://support.google.com/wallet/answer/15284332
- DC API in Chrome (desktop cross-device): https://developer.chrome.com/blog/digital-credentials-cross-device-ot
- Google ZKP age assurance (open-sourced): https://blog.google/innovation-and-ai/technology/safety-security/opening-up-zero-knowledge-proof-technology-to-promote-privacy-in-age-assurance/
- US state AV laws (post-Paxton) + thresholds/PRA: https://avpassociation.com/us-state-age-verification-laws-for-adult-content/ , https://onlinesafety.orrick.com/
- UK OSA HEAA: https://www.ofcom.org.uk/online-safety/protecting-children/age-checks-to-protect-children-online
- WA HB 2112 died: https://washingtonstatestandard.com/2026/02/10/more-dead-bills-stack-up-in-wa-legislature/
