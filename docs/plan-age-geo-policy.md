# Plan: Universal On-Device Age Verification (Privately) + Reserved Geo-Block

**Status:** For build (branch `feat/age-privately-ondevice`)
**Supersedes:** the earlier tiered geo-policy draft (which contradicted the adopted v2 and is no longer needed — see "Why this changed").

> ⚠️ **Not legal advice.** Encodes the public legal landscape (June 2026) for tuning with counsel.

---

## The shift: Privately makes "universal verification" actually achievable
The community **already voted (v2)** for *one universal rule: verify age once per account via a privacy-preserving provider; geo-block only jurisdictions that mandate government ID.* v2 couldn't be delivered because its named method (Apple Wallet) is **adult-banned and absent from WKWebView** — so "universal" died on iOS, which is why we drifted into geofencing tiers.

**Privately fixes the thing that broke v2.** It's an **on-device** age-estimation SDK (camera + model, runs locally) — *not* a wallet or DC-API flow — so it works on **iOS, Android, and web alike**, sidestepping both the Apple Wallet adult-ban and the WKWebView gap. That lets us deliver v2's actual intent and **drop the geofencing tiers**.

So the model is now:
- **Primary:** universal, once-per-account verification via **Privately (on-device)**, with **Google Wallet ZKP** as a faster alternative where a user has a credential.
- **Geo-block:** *reserved* as last-resort for jurisdictions that mandate **government-ID-only** verification — **currently none** (all in-effect US state laws + UK accept privacy-preserving methods). So geo-block ships as a config switch that's **off by default**.
- **No content-ratio (1/3) tracking, no per-state tiers.** Universal verification = compliant everywhere regardless of ratio.

---

## Values preserved (from the adopted v2 — unchanged)
Privacy-first; **never collect/store/transmit government ID**; contain-not-ban NSFW; no surveillance-vendor; geo-block only as last resort; moderation-key for encrypted reporting. **MiVOLO / self-hosted estimation: out** (uncertified for legal recognition). **Yoti: out** (IEEE S&P 2026 showed its *web flow* leaks image/IP/fingerprint to third parties — our actual use case).

---

## Why Privately, specifically (and the one gate before we trust it)
- **On-device by architecture:** image is captured, processed, and deleted on the device; only a result leaves. The exact failure mode IEEE found in Yoti (third-party broadcast) is *structurally absent* if the SDK doesn't phone home.
- **Certified:** Apple App Store "**no data collected**" label, **ISO/IEC 27566-1** (age-assurance standard), **ACCS/UKAS** (MAE ~1.26). ACCS recognition is the path to UK **HEAA** — so Privately may **also satisfy the UK and strict US states**, removing the need to block them. *(Confirm ACCS cert meets Ofcom HEAA for our deployment, and that estimation qualifies as "commercially reasonable" per strict states — counsel.)*
- **SHIP GATE — non-negotiable:** before NSFW launches, we run a **network trace (airplane-mode + proxy) on OUR actual SDK integration** and confirm zero telemetry on the verify path. Plus a **DPA + written "on-device, no telemetry" commitment** from Privately. Marketing/labels are necessary but not sufficient — the Yoti lesson.

---

## Architecture

### 1. Verification methods (behind the existing `verifyAge` provider registry)
- **`privately` (on-device)** — *primary, universal.* On native (Capacitor iOS/Android) it calls a native plugin wrapping the Privately SDK; on web, Privately's web/WASM path (or fall back to Google Wallet). 
- **`google_wallet` (ZKP)** — faster option on Android + Chrome (incl. desktop cross-device) for users with a wallet credential. Already built.
- Hierarchy: either method, once, sets `users.ageVerifiedAt` permanently.

### 2. Server trust (critical security requirement)
On-device estimation must produce a **server-verifiable signed attestation** — NOT a client-sent "I'm 18" boolean (spoofable). Privately + Privado ID issue a **device-based verifiable credential**; our server validates its signature before stamping `ageVerifiedAt`. The server never receives the image, only the signed pass/fail. *(Dev stub fakes the attestation; production validates Privately's signature.)*

### 3. Surface rules (App Store content policy — separate from verification)
Verification is universal, but **NSFW content visibility** still follows store rules:
- **Native apps (iOS + Android):** NSFW hidden by default; the "show adult content" opt-in is **set on the web** (account settings), never an in-app toggle (the Reddit/Tumblr pattern). Then NSFW renders in-app. 18+ app rating.
- **Web:** full surface.

### 4. Geo-block (reserved, off by default)
A config list of jurisdictions mandating gov-ID-only → block NSFW with a **smart screen** (reason + "why" + civic-literacy link). Currently empty. Resolved per-request from client IP via **local MaxMind GeoLite2** (no third party, nothing stored); unknown → allow.

### 5. Central resolver
`resolveNsfwAccess({ tribe, user, surface, region }) → { decision, reason, remediation }`, replacing the scattered `isNsfw && !ageVerifiedAt` checks at **view / join / create / discovery**. Decisions: `allow` | `needs_optin` (web) | `needs_verify` (→ Privately or Google Wallet) | `blocked` (gov-ID-mandate region).

---

## Build order
1. **Capacitor plugin interface** `AgeEstimation.estimateAge()` + **stub native impl** (returns a configurable result) → makes the flow **testable via cap on your iPhone now**, before the real SDK.
2. **`privately` provider** in `verifyAge` + client method that calls the plugin (native) / web path; server validates the (stubbed → real) signed attestation.
3. **Central `resolveNsfwAccess`** + refactor the enforcement points to use it.
4. **Surface gating** (Reddit pattern: web-set opt-in `users.showAdultContentAt`; native hides NSFW until set).
5. **Reserved geo-block** (MaxMind resolver + config, off by default) + smart block screen.
6. **Swap stub → Privately SDK** once obtained; **run the ship-gate network trace**; then enable NSFW.
7. Tests across method × surface × region.

**Dev strategy:** build steps 1–5 with the **stub** so the whole flow runs and tests via Capacitor on iOS today; step 6 swaps in the certified SDK and gates launch on the trace.

---

## Relationship to governance (v3 is now a *small* correction)
Because Privately realizes v2's universal-verification intent, **v3 is no longer a re-architecture** — it's a focused correction:
> "After the v2 vote we found Apple Wallet is adult-banned and can't be used for this. The universal method is **Privately on-device verification** (+ Google Wallet where available), not Apple Wallet. Everything else in v2 — universal once-per-account verification, never collect gov ID, geo-block only gov-ID-mandate jurisdictions, the moderation key — stands."

Ship the implementable build now (gated on the network trace); ratify v3 alongside. Draft v3 when ready.

## Honest caveats
- Privately must actually satisfy UK HEAA + strict-state "reasonable" standards (likely via ACCS, **confirm with counsel**) for the "no geo-block needed" conclusion to hold.
- Age **estimation** false-rejects real 18–24-year-olds (Challenge-25 buffer) → need a fallback (Google Wallet ZKP, retry, or a documented manual path).
- Privately is a **paid SDK** (cost/licensing) and the **network-trace ship-gate** is mandatory before we vouch.
- Apple/Google content rules on the NSFW itself still apply regardless of the verification method.
