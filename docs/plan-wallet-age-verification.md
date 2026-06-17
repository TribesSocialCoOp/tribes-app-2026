# Plan: Wallet-Based Age Verification (Issue #32)

**Status:** Planning. NSFW policy ratified (v2). Unblocked.
**Scope:** Privacy-preserving, one-time-per-account 18+ verification gating NSFW Tribe access.
**Sibling issue:** #31 (moderation key) — separate plan, shares crypto patterns.
**Date:** June 2026.

---

## 1. The Critical Finding: Apple ≠ Google

The v2 policy says: *"Apple Wallet and Google Wallet both now support age verification. You tap a button, your phone confirms you're 18+ ... and the app gets a simple yes/no."* This is **only half true**, and the gap drives every architectural decision below.

| | **Google Wallet** | **Apple — DeclaredAgeRange** | **Apple — ID in Wallet** |
|---|---|---|---|
| What it is | Digital Credentials API (OpenID4VP / mdoc) + **ZKP age-over-18** | OS API returning user's Apple-ID **declared** age range | Real mDL/passport in Wallet, biometric-gated |
| Cryptographically verifiable server-side? | **Yes** (IACA cert chain + device sig + ZKP proof) | **No** — device-trust only, no attestation | **Yes** (same mdoc/OpenID4VP path) |
| Privacy (no birthdate revealed)? | **Yes** (ZKP `mso_mdoc_zk` / longfellow-zk) | N/A (no data leaves device anyway) | Selective disclosure (age_over_18 only) |
| Legal assurance level | **High** — satisfies state age-gate "reasonable method" | **Low** — Apple itself says *"unsuitable for high-assurance age verification"* | **High** |
| Availability | Broad H1 2026 (Android 9+, Chrome/Edge) | Worldwide, iOS 26+ | **Nationwide via US passport** (any iPhone user); plus ~10 mDL states (CA, HI, OH, AZ, CO, GA, MD, TX…), 10+ in dev |
| Integration cost | Medium (RP onboarding + server verifier) | **Low** (entitlement + Swift API) | Medium (same verifier as Google) |

> **Key correction (June 2026):** Apple's **US-passport-based Digital ID** works for **any iPhone user regardless of state** (it's a federal document). So the verifiable Apple path is *not* limited to mDL states — it covers anyone nationwide with a US passport in Wallet, plus mDL-state residents. This makes a **verifiable-only** strategy viable on iOS without a low-assurance fallback for most users.

---

## 2. Strategy: High-Assurance / Verifiable Only (DECIDED)

**Decision (locked):** We require **cryptographically verifiable proof for everyone**. Quality and correctness over speed. We do **not** ship DeclaredAgeRange in v1 (device-trust, no attestation — fails our "we never see your identity but it must be real" bar).

Two verifiable paths, both ZK / selective-disclosure over the Digital Credentials API (OpenID4VP / mdoc), both verified by **our own server-side verifier**:

1. **Android / Chrome → Google Wallet ZKP** (`mso_mdoc_zk`, `age_over_18`).
2. **iOS → Apple ID-in-Wallet** (mDL **or US passport**) via OpenID4VP presentment, selective-disclosure `age_over_18`.

**Coverage gap (acknowledged):** users with neither a Google Wallet credential nor an Apple Digital ID (no US passport, non-mDL state, older OS) cannot verify in v1. For them: **deny NSFW access** (and geo-block where required) until a pluggable third-party vendor is added in Phase 4. This is the accepted trade-off for the higher assurance bar. `DeclaredAgeRange` remains a *possible* future medium-tier toggle if counsel later blesses it — not built now.

---

## 3. Four Integration Surfaces

The app loads **remote `tribes.app` inside a WebView** on native. The web Digital Credentials API (`navigator.credentials.get({ digital })`) is a **browser-level** API and is **not reliably exposed in WKWebView / Android System WebView**. So each surface needs its own entry path, all converging on one server verifier.

```
                          ┌────────────────────────────┐
  Desktop/mobile browser ─┤ navigator.credentials.get  │
                          │   ({digital}) [Chrome/Edge/ │
                          │    Safari that support it]  │──┐
                          └────────────────────────────┘  │
                          ┌────────────────────────────┐  │
  iOS native app ────────┤ Custom Capacitor plugin:    │  │
                          │  • DeclaredAgeRange (Swift) │  ├──► /api/age/verify
                          │  • PassKit Digital ID       │  │     (server verifier)
                          │    presentment (OpenID4VP)  │  │         │
                          └────────────────────────────┘  │         ▼
                          ┌────────────────────────────┐  │   users.age_verified_at
  Android native app ────┤ Custom Capacitor plugin:    │  │   + method + audit row
                          │  • CredentialManager /      │──┘   (NO PII, NO birthdate)
                          │    Digital Credentials      │
                          └────────────────────────────┘
```

- **Web browser users:** call the web API directly from a React flow.
- **Native users:** new **custom Capacitor plugin** (`AgeVerification`) — there is no off-the-shelf community plugin for this; follow the existing pattern used for `@capgo/capacitor-nfc` / nearby-multipeer. iOS side calls `AgeRangeService.requestAgeRange(ageGates: 18)` (entitlement `com.apple.developer.declared-age-range`) and/or PassKit presentment; Android side uses `CredentialManager` Digital Credentials.
- **All paths POST the result/proof to one server verifier**, which is the only trusted decision point.

---

## 4. Server-Side Verifier (`/api/age/verify`)

The verifiable paths require real cryptographic verification — we cannot trust a client-asserted boolean. New route handler (App Router, mirrors `src/app/api/upload/route.ts` structure):

1. Receive `{ surface, protocol, vp_token | declaredRange }` from client.
2. **For mdoc/OpenID4VP proofs (Google ZKP, Apple ID-in-Wallet):**
   - Decrypt the JWE with our private key (key sent in the request's `client_metadata`).
   - Rebuild the ISO 18013-5 session transcript from our nonce + key thumbprint.
   - Validate issuer cert chain against **IACA root certs**; verify MSO + device signatures.
   - For ZKP mode: verify the proof with **Google's `longfellow-zk`** verifier (or vendor reference verifier).
   - Confirm the asserted claim is exactly `age_over_18 = true`. **Discard everything else.**
3. **For DeclaredAgeRange:** no crypto; record the device-trust result + Apple's assurance-method signal. (Mark as medium assurance.)
4. **Nonce / replay protection:** server issues a one-time nonce before the ceremony (new `age_verification_challenges` table or reuse a short-TTL store); reject reused/expired nonces.
5. On success: set `users.age_verified_at = now()`, `age_verification_method`, write an audit row. **Never store the credential, birthdate, name, or document.**

**Build vs. buy (DECIDED): build in-house.** We already own and operate a security-sensitive crypto surface (the full E2EE / PRF-vault / NCII key-grant stack), so owning the verifier is consistent with how this codebase already works and avoids per-check vendor fees and a third-party data-handling relationship. Implement mdoc/OpenID4VP verification + ZKP validation with `longfellow-zk` (Google's open verifier lib) and a maintained IACA root-cert trust store. Isolate it in `src/lib/services/age-verification/` with the same rigor as the crypto modules. Note: this means **owning IACA root-cert rotation** as an operational task.

---

## 5. Data Model Changes

Minimal and PII-free. Reuse the existing migration workflow (`drizzle-kit migrate`, **never** `push --force`).

**`users` (additions):**
```ts
ageVerifiedAt: timestamp('age_verified_at', { withTimezone: true }),   // null = unverified
ageVerificationMethod: text('age_verification_method'),                // 'google_zkp' | 'apple_wallet_mdl' | 'apple_wallet_passport' | 'vendor'
// All v1 methods are high-assurance/verifiable; assurance column omitted unless a medium tier is later added.
```
> Note: `ageConfirmedAt` already exists and is the **13+ self-confirm** (App Store). Keep separate — this is the **18+ verified** flag.

**`tribes` (additions — prerequisite, see §7):**
```ts
isNsfw: boolean('is_nsfw').default(false),     // immutable once set; forces isPublic=false
```

**New `age_verification_challenges`** (nonce issue/consume) — or a short-TTL Redis-style store if one exists.

No table is needed to "store the proof" — by policy we keep only the pass/fail outcome.

---

## 6. Enforcement / Gating

Add a guard mirroring the existing `requireVerifiedEmail()` in `src/lib/actions/shared.ts`:

```ts
export async function requireAgeVerified(): Promise<string> {
  const userId = await requireAuth();
  const [u] = await db.select({ v: users.ageVerifiedAt })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!u?.ageVerifiedAt) throw new PublicError('AGE_VERIFICATION_REQUIRED');
  return userId;
}
```

Apply at every NSFW boundary:
- **Create** an NSFW Tribe → `requireAgeVerified()`.
- **Join / view** an NSFW Tribe → `requireAgeVerified()` (server-side, in tribe-auth service).
- **Feed / discovery** → filter NSFW Tribes and their content out for unverified users (policy §2 "Strict Opacity" — no previews, no snippets). Hook into the existing feed-service ring/mood filter.
- **Client UX:** catch `AGE_VERIFICATION_REQUIRED` → launch the verification flow (the right surface for the platform).

---

## 7. Prerequisite: NSFW Tribe Flagging

Age verification is meaningless without something to gate. There is currently **no `isNsfw` column** on tribes. Before/with this work:
- Add `tribes.isNsfw` (immutable once true).
- Enforce **auto privacy lock**: setting `isNsfw=true` forces `isPublic=false` permanently (policy §3) — at the service layer and DB default.
- Enforce **opacity** in feed/search/discovery (policy §2).
- Founder flagging UI + moderator enforcement flow (policy §6).

This is arguably its own issue; recommend a small companion issue so #32 has a target.

---

## 8. Phased Implementation

**Phase 0 — Foundations (no external deps):**
- `tribes.isNsfw` + auto privacy-lock + opacity filtering (§7).
- `users.age_verified_at` + method/assurance columns; `requireAgeVerified()` guard; gate the NSFW boundaries.
- Stub verification flow returns "unsupported" — proves the gating end-to-end.

**Phase 1 — Web browser path (highest ROI, lowest risk):**
- React verification flow using `navigator.credentials.get({ digital })`.
- Server verifier `/api/age/verify` (start with vendor/Google hosted verifier).
- Covers desktop + mobile-browser users immediately.

**Phase 2 — Android native:**
- Custom `AgeVerification` Capacitor plugin → CredentialManager / Digital Credentials → Google Wallet ZKP. Reuse the Phase-1 server verifier.

**Phase 3 — iOS native:**
- Same plugin, iOS side: **Apple ID-in-Wallet** presentment (mDL **or US passport**) via OpenID4VP, selective-disclosure `age_over_18`. Reuse the Phase-1 server verifier.
- **Native release build required** (the one piece that needs an App Store build, unlike the WebView-served web changes). Verify exact entitlement/Info.plist requirements for Wallet presentment during build.
- DeclaredAgeRange explicitly **out of scope** (high-assurance decision).

**Phase 4 — Coverage fallback:**
- Pluggable third-party verifiable-credential vendor for users with no wallet credential; **deny + geo-block** until then.
- Re-verification policy (per v2: **one-and-done**, never re-verify — so mainly handle account-recovery edge cases).

---

## 9. Risks & Notes

- **Coverage gap (accepted):** verifiable-only means users with no wallet credential (no US passport, non-mDL state, older OS) can't verify in v1 → denied NSFW access until the Phase-4 vendor lands. Accepted trade-off for the higher assurance bar.
- **Google RP onboarding:** 3–5 business-day approval + ToS + cert registration. Start early; it's a critical-path external dependency. ToS prohibits re-sharing credential data (we don't — good).
- **WebView limitation is real:** do not assume the web API works inside the native WebView; the native plugin path is mandatory for app users.
- **In-house verifier ownership:** we own IACA root-cert trust-store rotation + `longfellow-zk` upkeep as ongoing ops. Treat with the same care as the E2EE modules.
- **No monetization coupling** (policy §7): age verification must never be tied to payment/subscription. Keep it a standalone account flag.
- **Payment-processor survival clause** (policy §7) is out of scope here but constrains the broader NSFW feature.
- **Cost:** verifiable-proof verifications may carry per-check vendor fees; one-and-done design minimizes volume. Confirm pricing during provider selection.

---

## 10. Decisions (RESOLVED)

1. **Assurance bar:** ✅ **High-assurance / verifiable only.** DeclaredAgeRange not shipped in v1. Quality > speed.
2. **Verifier build vs. buy:** ✅ **Build in-house** (`longfellow-zk` + IACA trust store) — consistent with our existing owned crypto surface.
3. **NSFW flagging:** ✅ **Companion issue, done first** (§7) — gives #32 something to gate.
4. **Rollout order:** ✅ **Web → Android → iOS.**

### Open items to confirm during execution
- **Legal counsel sign-off** that two verifiable wallet paths + deny/geo-block-the-rest satisfies the applicable state age-gate laws (the policy's compliance theory).
- **Google RP onboarding** kicked off early (critical-path lead time).
- Exact iOS entitlements/Info.plist for Apple Wallet OpenID4VP presentment (confirm at Phase 3 build).

---

## Sources
- Apple DeclaredAgeRange API (iOS 26): https://developer.apple.com/news/?id=8jzbigf4 · https://swiftorbit.io/age-verification-in-ios-26-how-to-protect-kids-with-the-declaredagerange-api/
- Apple ID-in-Wallet age verification (state availability, June 2026): https://9to5mac.com/2026/06/04/apple-wallets-new-digital-id-feature-just-got-way-more-useful-in-texas/
- Google Wallet ZKP age verification: https://blog.google/products/google-pay/google-wallet-age-identity-verifications/
- Verify with Google Wallet — online integration (Digital Credentials API, OpenID4VP, ZKP): https://developers.google.com/wallet/identity/verify/accepting-ids-from-wallet-online
- Digital Credentials API browser support (2026): https://www.corbado.com/blog/digital-credentials-api
</content>
</invoke>
