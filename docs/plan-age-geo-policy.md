# Plan: Self-Attest + Minimal Geo-Block for NSFW (free), with optional wallet verify

**Status:** For build (branch `feat/age-privately-ondevice`)
**Supersedes:** the universal-Privately draft. Privately's on-device *native* SDK is
Enterprise-priced and its affordable tier isn't on-device — disproportionate for a
160-user platform with a minor NSFW feature. So we ship the **free, values-aligned**
model now and keep paid verification as a future drop-in.

> ⚠️ **Not legal advice.** Encodes the public legal landscape (June 2026) for tuning with counsel.

---

## The model (free, ships now)
- **Default everywhere: self-attestation.** A one-time **web-set "show adult content" 18+
  opt-in** (`users.showAdultContentAt`). This single flag does double duty: it's the 18+
  self-attestation **and** Apple's required "enable via website" switch (the Reddit pattern).
- **Geo-block (the only hard restriction): KS, WY, SD, UK.** These are the jurisdictions whose
  age-verification laws catch us *regardless of content ratio* (no/low threshold), where
  self-attest isn't lawful and we're not (yet) verifying. Free to enforce (MaxMind).
- **Optional, free, stronger verify: Google Wallet ZKP** (Android + web) for users who want it
  or where it helps — never required.
- **Privately on-device: documented future drop-in** (provider already scaffolded). Revisit when
  an affordable, iOS-capable, privacy-clean option exists.
- **No content-ratio tracking.** At our scale we're plainly under the 1/3 thresholds, so the ~19
  threshold-state laws don't apply → self-attest there. Revisit only if NSFW ever becomes a major
  fraction of the platform (not an active task now).

## Why these specific blocks (not 26 states)
Most US AV laws use a **">1/3 of the site is adult"** trigger — a genuine safe harbor that
**exempts a platform plainly under one-third**. So those states get self-attest, not a block.
Only the no/low-threshold laws catch us regardless: **Kansas** (25%, *page-view*-weighted, +$50k
private damages), **Wyoming** & **South Dakota** (no threshold). Plus the **UK** OSA (HEAA; we
won't compromise privacy/budget to meet it yet → block is Ofcom's accepted last resort).
*(Confirm the list + the 1/3 reliance with counsel.)*

---

## iOS — explicit, because it kept getting muddied
Self-attestation needs **no wallet and no Digital Credentials API**, so the Apple Wallet adult-ban
and the WKWebView gap **do not apply here**. Therefore:
- **iOS works fine everywhere self-attest applies** — the user sets the opt-in **on the web**
  (Reddit pattern, also Apple-required), and NSFW then renders **in the iOS app**.
- **iOS is blocked ONLY in the geo-blocked locales (KS/WY/SD/UK)** — same as every platform. There
  is **no iOS-specific block.**
- Apple/Google **content** rules still apply to *how* NSFW shows in the app (hidden by default,
  opt-in set on web, not primary, filtered, 18+ rating) — that's content delivery, not verification.

---

## Values preserved (adopted v2)
Privacy-first; **never collect/store/transmit government ID** (we collect *nothing* now — self-attest
holds no PII); contain-not-ban; geo-block only as last resort; **moderation key** for encrypted
reporting. Yoti: out (IEEE web-flow data leak). Self-hosted estimation: out (no legal recognition).

---

## Architecture

### Decision model — `resolveNsfwAccess({ tribe, user, region, surface }) → { decision, reason, remediation }`
Replaces the scattered `isNsfw && !ageVerifiedAt` checks at **view / join / create / discovery**:
- not NSFW → `allow`
- region in blocklist (KS/WY/SD/UK) → `blocked` (smart screen: reason + why + civic-literacy link)
- user lacks `showAdultContentAt` → `needs_optin` (set on web; native app links out to web)
- else → `allow` (self-attested), with an **optional** "Verify with Google Wallet" upgrade

### Data
- **`users.showAdultContentAt`** (new, nullable timestamp; web-set only). Default null = NSFW hidden
  everywhere. The self-attestation + the Apple "enabled via website" flag.
- `users.ageVerifiedAt` (existing) — set if a user takes the optional Google Wallet ZKP verify.

### Geo
Per-request from client IP via **local MaxMind GeoLite2** (country + US subdivision). No third party,
nothing stored. Unknown region → allow (self-attest). Uniform for web + Capacitor (same proxy).

### Surface (App Store content policy — not verification)
Native apps: NSFW hidden by default; opt-in set on web; renders in-app after; 18+ rating.

### Optional verify + future
`verifyAge` registry already holds `google_wallet` (ZKP) and the scaffolded `privately` provider.
Google Wallet stays as a free optional upgrade; Privately stays dormant until affordable/iOS-capable.

---

## Build order (all SDK-independent — ships now)
1. **`users.showAdultContentAt`** migration + the **web-only** 18+ opt-in toggle/action (Reddit pattern).
2. **Geo resolution** (`src/lib/geo/resolve-region.ts`, MaxMind, dev override) + **surface** header.
3. **`resolveNsfwAccess`** + refactor the 5 enforcement points to use it.
4. **Block list** config (KS/WY/SD/UK) + the **smart block screen** (reason + civic link).
5. **Discovery filtering** (hide NSFW where blocked or no opt-in) + client branching.
6. (Optional) wire the existing **Google Wallet ZKP** as the upgrade button.
7. Tests: region × surface × opt-in → decision matrix.

## Governance
Build + test first; **draft v3 when done** ("allow NSFW; self-attest where legal; geo-block KS/WY/SD/UK
where the law demands verification we won't compromise privacy/budget to provide yet; free optional
Google Wallet verify; revisit paid verification when a privacy-clean, affordable, iOS-capable option
exists"). Anchored on the unchanged v2 values.

## Honest caveats
- Blocking KS/WY/SD/UK cuts NSFW for those users (reversible when we add verification).
- Self-attest is lawful here only because we're **exempt/no-law** in self-attest regions — it is **not**
  compliance *inside* a covered law-state, which is exactly why we block the ones that cover us.
- Geo-IP is VPN-bypassable (a recognized reasonable measure; bypass is the user's problem).
- Confirm the block list + the <1/3 reliance with counsel before launch.
