# Testing Guide: Wallet Age Verification (issue #32)

A practical, start-to-finish guide for testing the NSFW age-verification feature — written
for someone new to digital-credential / wallet testing. Read top to bottom the first time.

---

## Status — what's implemented vs. tested

**Implemented (server + client):**
- Server-side OpenID4VP / mdoc verifier for **Google Wallet** and **Apple Wallet**
  (`src/lib/services/age-verification/`, real `@owf/mdoc` IACA-chain + COSE verification).
- A **dev provider** that exercises the real gate loop without a wallet.
- **Once-per-profile** verification: the outcome is stored permanently on the user row
  (`users.age_verified_at` + `age_verification_method`). A verified user is **never asked
  again** — every gate (create / join / **view**) reads that one field. No per-tribe re-verify.
- **Security hardening landed** (see "Security behaviors" below): per-user binding of the
  verification ceremony (C2), single-use nonce (C1), the 18+ gate enforced at the **content
  boundary** not just join (H1/H2/H3), method derived from the verified document (M2), and
  hardened secrets/dev-provider (L1/L2).

**Tested so far:** only **Layer 0 (dev provider)**. Layers 1 (Google sandbox) and 2 (Apple
on an iOS device) are the next steps and are what the rest of this guide gets you ready for.

| Layer | What it proves | Setup cost | Where |
|---|---|---|---|
| **0. Dev provider** | All the *gate logic* (flag, lock, discovery, opacity, gate→verify→unlock, retry) | none | local dev |
| **1. Google Wallet sandbox** | The *real* OpenID4VP/mdoc verification on web | medium (keys + a sandbox Android device) | local web + staging/prod for the app |
| **2. Apple Wallet** | The iOS in-app (WKWebView) path | higher (iOS 26 device + Digital ID) | the deployed app, on your iPhone |

---

## Key mental model (read this first)

- **A "wallet" holds the ID.** The user's phone (Google Wallet / Apple Wallet) holds a
  digital ID. Our app is the **verifier (relying party, "RP")** — we *ask* the wallet
  "is this person 18+?" and get a cryptographically signed yes/no. We never see the ID.
- **Sandbox = a fake-but-real test environment.** Google/Apple give you **test RP keys**
  and let you load a **fake test ID** into a wallet in "sandbox mode." The whole handshake
  is real crypto; only the identities are fake. Sandbox keys are pre-trusted **only** in
  sandbox and must never be used in production.
- **The keys are just env vars.** Our code reads everything from environment variables
  (`GOOGLE_WALLET_*`, `APPLE_WALLET_*`). Drop the sandbox keys in → the wallet buttons
  light up. No code change. (See `src/lib/services/age-verification/config.ts`.)

---

## Security behaviors to keep in mind while testing

These hardening fixes changed how the flow behaves — if you don't account for them a valid
test can look like a failure:

- **One request → one submission (single-use nonce, C1).** Each "Verify" press issues a
  server nonce that is consumed on submit. **Re-submitting the same wallet response fails**
  with *"This verification request has expired or already been used."* Always start a fresh
  verification attempt; don't replay a captured response.
- **Same logged-in user for the whole ceremony (C2).** The request is cryptographically
  bound to the account that started it. You **cannot** build the request as user A and submit
  it as user B — it will be rejected. (This is the fix that makes "verify once per profile"
  trustworthy.)
- **NSFW content is gated on *view*, not just join (H1).** An un-verified user who is
  somehow a member (e.g. a tribe flipped to NSFW) still **cannot load the feed** — the
  content endpoint throws `AGE_VERIFICATION_REQUIRED`. So "member but not verified" = no
  content, by design.
- **Verification is permanent.** Once `age_verified_at` is set the user sails through every
  gate. To re-test the gate, reset the user (see Quick reference).

---

## Prerequisites for *deployed* / on-device testing (env + infra)

Layer 0 needs none of this. Layers 1–2 on a deployed environment (staging/guarded-prod)
need these set **in that environment** (the native app has no localhost — see "Where we
MUST test in prod"):

| Var | Why it matters for testing | Notes |
|---|---|---|
| `SESSION_SECRET` | Seals the verifier state (domain-separated key, L1). | Required everywhere. |
| `INTERNAL_API_SECRET` | App ↔ ws-relay auth. Real-time key-sync/notifications ride this. **Required in prod — fails closed if unset** (the old hardcoded default was removed). Must be the **same value** in the app and the relay. | Local dev uses a built-in `dev-only-internal-secret` when blank, so you can leave it unset locally. Generate: `openssl rand -hex 32`. |
| `VALKEY_URL` | Backs the **single-use nonce** (C1) across instances. | Local dev falls back to in-memory (single process) — fine locally. On a **multi-instance** deploy, set this or single-use only holds per-instance. (With C2's user-binding, a missed single-use check is a same-user no-op, not a cross-account hole — but set it for correctness.) |
| `APP_ORIGIN` | Optional allowlist; the signed request + transcript are **origin-bound**. Must match the origin you test from and what's registered with Google/Apple. | |
| `GOOGLE_WALLET_*` / `APPLE_WALLET_*` | The sandbox/RP keys that light up each provider button. | See Layers 1–2. |

> If `INTERNAL_API_SECRET` is missing in a deployed env you'll see the relay log
> *"INTERNAL_API_SECRET not set — /internal/push will reject all requests"* and real-time
> delivery (incl. tribe-key distribution nudges) silently stops. That was the prod error we
> just fixed by requiring the var; set it on both the app and `ws-relay` containers.

---

## Layer 0 — Test the gate logic now (no keys, no wallet)

This proves everything *except* the wallet crypto: NSFW flagging, the auto privacy-lock,
discoverability, content opacity, and the full gate → verify → unlock → auto-retry loop.

```bash
npx drizzle-kit migrate     # apply the age columns to your local DB (no-op if already applied)
npm run dev                 # http://localhost:9002 — also co-starts the ws-relay
```

The **dev provider** is enabled automatically in dev (`NODE_ENV !== 'production'`). It runs
through the *same* server verify + flag-setting + single-use path as the real providers —
only the attestation is simulated.

**Test script:**
1. Log in. Create a tribe with the **Adult (18+) Tribe** toggle ON → confirm visibility
   locks to Private and a **"List in discovery"** toggle appears.
2. Open the new tribe → **Settings** → confirm the NSFW switch is ON + disabled
   (permanent), and visibility is locked.
3. Go to **Discover / Search** → the tribe shows with an **18+** badge.
4. **As a second, un-verified user:** open that tribe → you see the **"Continue to age
   verification"** join step, not the content. Confirm/join → the **"Verify you're 18+"**
   dialog appears (the gate firing).
5. Click **"Dev: simulate 18+ verification"** → the dialog closes and the join
   **auto-retries** and succeeds. You won't be asked again (permanent).
6. Confirm in the DB: `select email, age_verified_at, age_verification_method from users
   where age_verified_at is not null;` → method = `dev`.

> **Dev provider is HARD-DISABLED in production (L2).** It is enabled purely by
> `NODE_ENV !== 'production'` and returns unavailable in production regardless of any env
> flag (the old `AGE_VERIFICATION_ALLOW_DEV` variable is not read anywhere). If you need
> the dev provider on a staging box, run that box with `NODE_ENV !== 'production'`.

---

## Layer 1 — Google Wallet sandbox (the real wallet path)

### Step 1 — Get allowlisted and get the keys (one-time, with Google; no code)

1. **Allowlist your Google account for sandbox.** Fill the **Google Pay Sandbox Access
   Request form** (linked from
   https://developers.google.com/wallet/identity/verify/sandbox). This lets your Google
   account switch a phone's wallet into "sandbox mode."
2. **Get RP (verifier) sandbox credentials** from the same page (pre-trusted in sandbox):
   - a **private key** (PEM) — signs our request,
   - a **public certificate** (PEM) — embedded so the wallet trusts us,
   - **RP metadata** (base64url CBOR) — our display name/logo/policy,
   - the **client_id** = the x509 hash of that certificate,
   - the **IACA test root certificate(s)** — the trust anchor we verify the wallet's
     response against. If it's not on the page, request it via
     `wallet-identity-rp-support@google.com`.
   - The **production** equivalent needs the full RP Onboarding Form + ToS + a registered
     production cert — later, only when going live.

### Step 2 — Create a test ID in a sandbox wallet (needs an Android device)

1. On an Android phone (or emulator) with Google Wallet, enable sandbox: **Settings → your
   Google Account → All services → (Other) → TapAndPay Environment → SANDBOX**, reboot.
   (The toggle appears only after Step 1's allowlisting.)
2. Add a **test ID pass** to the sandbox wallet (Google's flow uses the *Utopia ePassport
   Simulator* on a second device; see "Create a test ID" in Google's docs). This is your
   fake 18+ identity.

### Step 3 — Drop the keys into env

`.env.local` (local web) or the deployed env's secrets. PEM blocks are multi-line — keep the
`-----BEGIN/END-----` lines and quote them:

```bash
GOOGLE_WALLET_RP_ID="<x509 hash / client_id exactly as Google issued it>"
# ⚠️ Reader key MUST be PKCS#8 ("BEGIN PRIVATE KEY") — the server uses importPKCS8().
# Google often issues a SEC1 key ("BEGIN EC PRIVATE KEY"); convert it first:
#   openssl pkcs8 -topk8 -nocrypt -in google-key.pem -out google-key.pkcs8.pem
GOOGLE_WALLET_READER_KEY_PEM="-----BEGIN PRIVATE KEY-----
...sandbox private key (PKCS#8)...
-----END PRIVATE KEY-----"
GOOGLE_WALLET_READER_CERT_PEM="-----BEGIN CERTIFICATE-----
...sandbox RP cert...
-----END CERTIFICATE-----"
GOOGLE_WALLET_IACA_PEM="-----BEGIN CERTIFICATE-----
...sandbox IACA root (concatenate multiple CERTIFICATE blocks if given several)...
-----END CERTIFICATE-----"
# optional
GOOGLE_WALLET_RP_METADATA="<base64url CBOR>"
GOOGLE_WALLET_DOCTYPE="org.iso.18013.5.1.mDL"   # default; change if the test ID differs
GOOGLE_WALLET_NAMESPACE="org.iso.18013.5.1"     # default
APP_ORIGIN="http://localhost:9002"              # must match the origin you test from, exactly
```

**Validate the keys before the wallet round-trip** (parses them exactly as the server does —
catches the PKCS#8 gotcha and any missing field):

```bash
npm run check:wallet
```

When the keys are valid, `getAgeVerificationStatus()` reports `google_wallet` available and the
dialog shows a **"Verify with Google Wallet"** button.

### Step 4 — Run the flow & verify

- **Where:** Chrome **on the sandbox-mode Android phone** (the Digital Credentials API needs
  a real wallet on the device). Desktop Chrome can work via cross-device (QR to the phone).
- Hit the NSFW gate → **Verify with Google Wallet** → OS wallet picker → present the test ID
  → our server decrypts + verifies the mdoc against the IACA anchor, reads `age_over_18`,
  **consumes the nonce**, and stamps the profile.
- **If it fails:** the dialog shows the error; check dev-server logs for the verifier
  exception (signature / cert / transcript / nonce / **user-binding**). This first live
  round-trip is also where we confirm the request/response wire shapes — expect to adjust
  `src/lib/services/age-verification/oid4vp.ts` once against real sandbox output.
- **Re-testing:** each attempt needs a fresh "Verify" press (single-use nonce). To re-run
  the *gate*, reset the user (Quick reference).

---

## Layer 2 — Apple Wallet on your iOS device

- **Device:** an iPhone on **iOS 26+** with a Digital ID in Apple Wallet (a **US-passport
  Digital ID** works nationwide; a state mDL where supported). Apple's test story is less
  open than Google's — you may need a real Digital ID and Apple-side RP setup.
- **How our app does it:** the iOS path is the **W3C Digital Credentials API inside the
  app's WKWebView** (iOS 26 WebKit provides `navigator.credentials.get({digital})`) — the
  *same* `oid4vp.ts` verifier as Google, **not** a separate native plugin. So testing the
  in-app flow means running the **real app**, which loads remote `tribes.app`.
- **Keys:** `APPLE_WALLET_*` env vars (same shape as Google), set in the deployed env the
  app points at.
- **Steps:**
  1. Put `APPLE_WALLET_*` (+ `SESSION_SECRET`, `INTERNAL_API_SECRET`, `APP_ORIGIN`,
     ideally `VALKEY_URL`) in the **staging/guarded-prod** env the iOS build targets.
  2. Build & install the app on your iPhone (origin must be the registered `tribes.app`
     origin — see below).
  3. In-app: open an NSFW tribe → gate → **Verify with Apple Wallet** → the iOS wallet
     sheet appears → present your Digital ID → server verifies → profile stamped.
- **Open item (confirm during this layer):** whether WKWebView needs a browser-class
  **entitlement** to use the Digital Credentials API (passkeys needed one). If so: add the
  entitlement + provisioning-profile update + a native release build before this works.

---

## Where we MUST test in prod (or a prod-like deploy)

1. **The native app has no localhost.** The iOS/Android apps load **remote `tribes.app`** in
   a WebView. Any **in-app** wallet test requires the sandbox/RP keys (and
   `INTERNAL_API_SECRET`, `SESSION_SECRET`, etc.) to live in the **deployed** environment the
   app points at. You cannot test the in-app flow purely locally.
2. **Origin binding.** The signed request, `client_id`, and session transcript are bound to a
   specific **origin**. The origin you test from must match what's registered with
   Google/Apple and `APP_ORIGIN`.
3. **Same constraint we already hit with passkeys/E2E** (project memory): native
   crypto/identity flows are origin-bound to `tribes.app` and can't be exercised against a
   local build — you deploy to test them.

**Practical recommendation:**
- **Web (desktop / Android Chrome):** test locally with sandbox keys in `.env.local`.
- **Native app (iOS / Android):** deploy keys to a **staging/preview** env (or guarded prod)
  the app can point at, and test on-device there. Providers are env-gated and NSFW won't ship
  until the feature is done, so there's no exposure to real users meanwhile. Remember to set
  `INTERNAL_API_SECRET` (both app + relay) and, on multi-instance, `VALKEY_URL`.
- **Going live:** swap sandbox keys for **production** RP credentials (full Google RP
  onboarding + ToS + prod cert; Apple prod RP setup). Production keys verify against
  production IACA roots.

---

## Quick reference

**Env vars** (see `config.ts`): `GOOGLE_WALLET_RP_ID`, `_READER_KEY_PEM`, `_READER_CERT_PEM`,
`_IACA_PEM`, `_RP_METADATA?`, `_DOCTYPE?`, `_NAMESPACE?` (same with `APPLE_WALLET_` prefix);
`APP_ORIGIN?`; `SESSION_SECRET` (required — seals/​domain-separates the verifier state);
`INTERNAL_API_SECRET` (required in prod — app↔relay; fails closed if unset);
`VALKEY_URL` (single-use nonce across instances; in-memory fallback in dev).
`AGE_VERIFICATION_ALLOW_DEV` is **not read anywhere** — the dev provider is enabled purely
by `NODE_ENV !== 'production'` and hard-off whenever `NODE_ENV=production`.

**Reset a user to re-test the gate:** `update users set age_verified_at = null,
age_verification_method = null where email = '...';`

**Safety:** never commit keys; sandbox keys are sandbox-only; the dev provider can't run in
production; `INTERNAL_API_SECRET` must be set (same value) on the app and the relay.
