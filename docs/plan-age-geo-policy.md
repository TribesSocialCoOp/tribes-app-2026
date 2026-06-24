# Plan: Tiered NSFW Age Gate — self-attest / wallet-verify / block

**Status:** Built on `feat/age-privately-ondevice` (server + discovery + opt-in UI done).

> ⚠️ **Not legal advice.** Encodes the public legal landscape (June 2026) for tuning with counsel.

---

## The model: three region tiers
NSFW is hidden by default everywhere. Access depends on the user's region (resolved
privately — see Geo) and what they've done:

| Tier | Regions | What unlocks NSFW |
|------|---------|-------------------|
| **open** | No AV law (WA, ~24 states, EU, rest of world) | **Self-attest** — a one-time web-set 18+ opt-in. (Google Wallet also works.) |
| **verify** | **The 26 US states with an AV law in effect** (incl. KS/WY/SD) | **Google Wallet ZKP verification** — the easy self-attest route is **blocked** here. |
| **blocked** | **UK** (+ reserved for any gov-ID-only mandate) | Nothing — NSFW fully unavailable until we have a method we trust. |

**We do NOT rely on the 1/3 content-threshold exemption.** Any state with a law
requires real verification, regardless of our content ratio — so there's nothing to
track and no exemption to defend.

### Why these assignments (verified June 2026)
26 states have adult-content AV laws in effect (WV was #26, eff. 2026-06-12). Most use
a 1/3 threshold that *would* exempt a sub-1/3 platform, but per policy we require
verification in **all** of them anyway. KS (25%, page-view-weighted, +$50k private
damages), WY & SD (no threshold) are the harshest — but Google Wallet ZKP is a valid
method there, so they're **verify**, not full blocks. LA's law is enjoined (Dec 2025)
but kept in the verify set for conservative consistency. UK OSA HEAA has no confirmed
Google Wallet route → **block**. *(Config-driven; review with counsel quarterly.)*

---

## iOS — how verify-tier works given Apple's constraints
Google Wallet ZKP runs on **Android + web (Chrome/Safari desktop via the DC API)** but
**not in the iOS app's WKWebView**. Because verification is **account-level**, an iOS
user in a verify state verifies **once on the web** (Safari/desktop) and it then
**unlocks the app**. So:
- **open regions:** iOS works fully (web-set self-attest opt-in, then renders in-app).
- **verify regions:** iOS users must complete Google Wallet **on the web first**; after
  that their account is verified and NSFW works in the app. A detour, but viable.
- **blocked regions (UK):** unavailable on every surface.

Apple/Google **content** rules still apply to *how* NSFW shows in the app (hidden by
default, opt-in set on web, not primary, filtered, 18+ rating) — separate from the gate.

---

## Values preserved (adopted v2)
Privacy-first; **never collect/store/transmit government ID** (self-attest holds no PII;
Google Wallet ZKP reveals only over-18); contain-not-ban; geo-block only as last resort;
moderation key for encrypted reporting. Yoti: out (IEEE web-flow leak). Self-hosted /
Privately on-device: out for now (Privately's native SDK is Enterprise-priced —
dormant drop-in via the provider registry if economics change).

---

## Architecture (built)
- **`src/lib/geo/age-policy.ts`** — pure tiers + `resolveNsfwAccess` → `allow` /
  `needs_optin` / `needs_verify` / `blocked`. `VERIFY_REGIONS` (26 states) +
  `BLOCKED_REGIONS` (GB). Unit-tested.
- **`src/lib/geo/resolve-region.ts`** — region from IP via a **local MaxMind GeoLite2
  DB, in-process; IP never sent to a third party, nothing stored.** Dev override env;
  unknown → open (permissive).
- **`src/lib/age-verification/nsfw-gate.ts`** — `resolveNsfwGate` (gathers region +
  surface + user flags) and `canSeeNsfw` (discovery filter).
- **Enforcement (5 points):** view / join×2 / create×2 map decisions to:
  `blocked → NSFW_REGION_BLOCKED`, `needs_verify → AGE_VERIFICATION_REQUIRED` (the
  existing Google Wallet dialog), `needs_optin → NSFW_OPT_IN_REQUIRED`.
- **Discovery:** search + main tribe query hide NSFW unless `canSeeNsfw`.
- **Opt-in:** `users.show_adult_content_at` + a **web-only** Settings toggle.
- **Server trust:** `ageVerifiedAt` is only set by validated Google Wallet attestations
  (existing path); self-attest sets `show_adult_content_at` only.

## Remaining
- **⚠️ MaxMind `.mmdb` provisioning** — until `GEOIP_DB_PATH` is set, every region is
  `open` (geo-block + verify-tier are INERT). Test now with `AGE_GEO_OVERRIDE`.
- **Block / verify content screens** (tribe detail) — friendly "verify with Google
  Wallet" and "unavailable in your region" screens (copy/UX with the user).
- **Native `X-Tribes-Surface` header** — Capacitor builds must send it.
- **v3 policy draft** — after build + test.

## Honest caveats
- Requiring verification in all 26 law states is **stricter than the 1/3 exemption
  requires** — deliberately conservative (no ratio tracking, no exemption to defend).
- iOS users in verify states must verify via the web first (account-level unlock).
- Google Wallet ZKP availability (esp. cross-device / Safari DC API) should be
  confirmed on real devices before launch.
- Geo-IP is VPN-bypassable (a recognized reasonable measure).
