# Testing Guide: Wallet Age Verification (issue #32)

A practical, start-to-finish guide for testing the NSFW age-verification feature — written
for someone new to digital-credential / wallet testing. Read top to bottom the first time.

There are **three layers** of testing, in increasing setup cost. Do them in order.

| Layer | What it proves | Setup cost | Where |
|---|---|---|---|
| **0. Dev provider** | All the *gate logic* (flag, lock, discovery, opacity, gate→verify→unlock, retry) | none | local dev |
| **1. Google Wallet sandbox** | The *real* OpenID4VP/mdoc verification on web | medium (keys + a sandbox device) | local web + staging/prod for the app |
| **2. Apple Wallet** | The iOS in-app (WKWebView) path | higher (iOS 26 device + Apple ID) | the deployed app |

---

## Key mental model (read this first)

- **A "wallet" holds the ID.** The user's phone (Google Wallet / Apple Wallet) holds a
  digital ID. Our app is the **verifier (relying party, "RP")** — we *ask* the wallet
  "is this person 18+?" and get back a cryptographically signed yes/no. We never see the ID.
- **Sandbox = a fake-but-real test environment.** Google/Apple give you **test RP keys**
  and let you load a **fake test ID** into a wallet in "sandbox mode." The whole handshake
  is real crypto; only the identities are fake. Sandbox keys are pre-trusted **only** in
  sandbox and must never be used in production.
- **The keys are just env vars.** Our code reads everything from environment variables
  (`GOOGLE_WALLET_*`, `APPLE_WALLET_*`). Drop the sandbox keys in → the wallet buttons
  light up. No code change. (See `src/lib/services/age-verification/config.ts`.)

---

## Layer 0 — Test the gate logic now (no keys, no wallet)

This proves everything *except* the wallet crypto: NSFW flagging, the auto privacy-lock,
discoverability, content opacity, and the full gate → verify → unlock → auto-retry loop.

```bash
npx drizzle-kit migrate     # apply the new columns to your local DB
npm run dev                 # http://localhost:9002
```

The **dev provider** is enabled automatically in dev (`NODE_ENV !== 'production'`). It runs
through the *same* server verify + flag-setting path as the real providers — only the
attestation is simulated.

**Test script:**
1. Log in. Create a tribe with the **Adult (18+) Tribe** toggle ON → confirm visibility
   locks to Private and a **"List in discovery"** toggle appears.
2. Open the new tribe → **Settings** → confirm the NSFW switch is ON + disabled
   (permanent), and visibility is locked.
3. Go to **Discover / Search** → the tribe shows with an **18+** badge.
4. **As a second, un-verified user:** open that tribe → you see the **"This is an adult
   (18+) Tribe → Verify age & join"** card (not the content). Click join → the
   **"Verify you're 18+"** dialog appears (this is the gate firing).
5. Click **"Dev: simulate 18+ verification"** → the dialog closes and the join
   **auto-retries** and succeeds. You won't be asked again.
6. Confirm in the DB: `select email, age_verified_at, age_verification_method from users
   where age_verified_at is not null;` → method = `dev`.

> The dev provider is **hard-disabled in production** (it returns false on availability
> unless `NODE_ENV !== 'production'` or `AGE_VERIFICATION_ALLOW_DEV=true`). Never set that
> flag in prod.

---

## Layer 1 — Google Wallet sandbox (the real wallet path)

### Step 1 — Get allowlisted and get the keys

You (a human) need to do these once with Google. None of it is code.

1. **Allowlist your Google account for sandbox.** Fill the **Google Pay Sandbox Access
   Request form** (linked from
   https://developers.google.com/wallet/identity/verify/sandbox). This lets your Google
   account switch a phone's wallet into "sandbox mode."
2. **Get RP (verifier) sandbox credentials.** From the same sandbox page, Google provides
   **test RP credentials that are pre-trusted in sandbox**:
   - a **private key** (PEM) — used to sign our request,
   - a **public certificate** (PEM) — embedded in the request so the wallet trusts us,
   - **RP metadata** (base64url CBOR) — our display name/logo/policy,
   - the **client_id** = the x509 hash of that certificate.
   - You also need the **IACA test root certificate(s)** — the trust anchor we verify the
     wallet's response against. (If it's not on the page, request it via
     `wallet-identity-rp-support@google.com`.)
   - The **production** equivalent requires the full **RP Onboarding Form + Terms of
     Service + a registered production cert** — do that later, only when going live.

### Step 2 — Create a test ID in a sandbox wallet

You need an Android phone (or emulator) running Google Wallet:
1. Enable sandbox mode: **Settings → your Google Account → All services → (Other) →
   TapAndPay Environment → SANDBOX**, then reboot. (The toggle only appears after Step 1's
   allowlisting.)
2. Add a **test ID pass** to the sandbox wallet (Google's flow uses the *Utopia ePassport
   Simulator* on a second device to scan a fake passport; see "Create a test ID" in
   Google's docs). This is your fake 18+ identity.

### Step 3 — Drop the keys into env

Add to `.env.local` (local) or your deployment's secrets. PEM blocks are multi-line — keep
the `-----BEGIN/END-----` lines and wrap in quotes (or use `\n`):

```bash
GOOGLE_WALLET_RP_ID="<x509 hash / client_id>"
GOOGLE_WALLET_READER_KEY_PEM="-----BEGIN EC PRIVATE KEY-----
...sandbox private key...
-----END EC PRIVATE KEY-----"
GOOGLE_WALLET_READER_CERT_PEM="-----BEGIN CERTIFICATE-----
...sandbox RP cert...
-----END CERTIFICATE-----"
GOOGLE_WALLET_IACA_PEM="-----BEGIN CERTIFICATE-----
...sandbox IACA root...
-----END CERTIFICATE-----"
# optional
GOOGLE_WALLET_RP_METADATA="<base64url CBOR>"
GOOGLE_WALLET_DOCTYPE="org.iso.18013.5.1.mDL"   # default; change if the test ID differs
GOOGLE_WALLET_NAMESPACE="org.iso.18013.5.1"     # default
APP_ORIGIN="https://<the origin you test from>" # optional allowlist; must match exactly
```

When these are set, `getAgeVerificationStatus()` reports the `google_wallet` provider as
available and the dialog shows a **"Verify with Google Wallet"** button.

### Step 4 — Run the flow & verify

- **Where:** a Chrome browser **on the sandbox-mode Android phone** (the Digital
  Credentials API needs a real wallet on the device). Desktop Chrome can work via
  cross-device (QR to the phone).
- Hit the NSFW gate → **Verify with Google Wallet** → the OS wallet picker appears →
  present the test ID → our server decrypts + verifies the mdoc against the IACA anchor and
  reads `age_over_18` → flag set.
- **If it fails:** the dialog shows the error. Check the dev-server logs for the verifier
  exception (signature/cert/transcript/nonce). This first live round-trip is also where
  we confirm the request/response wire shapes are exactly right — expect to adjust
  `src/lib/services/age-verification/oid4vp.ts` once against real sandbox output.

---

## Layer 2 — Apple Wallet (iOS app)

- **Device:** an iPhone on **iOS 26+** with a Digital ID in Apple Wallet (a **US-passport
  Digital ID** works nationwide; or a state mDL where supported). Apple's test/sandbox
  story is less open than Google's — you may need a real Digital ID and Apple-side RP setup.
- **Keys:** same idea, in `APPLE_WALLET_*` env vars.
- **Where it runs:** the iOS path is the **W3C Digital Credentials API inside the app's
  WKWebView** (iOS 26 WebKit provides it) — *not* a custom plugin. So testing the in-app
  flow means running the **real app**, which loads remote `tribes.app` (see prod note
  below). Open item: confirm whether WKWebView needs a web-browser-class **entitlement**
  (it may, like passkeys did); if so, add it + a provisioning-profile update + a native
  release build.

---

## Where we MUST test in prod (or a prod-like deploy)

This is the part that surprises people, so it's called out explicitly:

1. **The native app has no localhost.** The iOS/Android apps load **remote `tribes.app`**
   in a WebView. There is no `localhost` inside the app — it always talks to the deployed
   origin. So **any in-app wallet test requires the sandbox keys to live in the deployed
   environment the app points at.** You cannot test the in-app flow purely locally.
2. **Origin binding.** The signed request, the `client_id`, and the session transcript are
   bound to a specific **origin**. Sandbox RP credentials are registered against the origin
   you'll use. The origin you test from must match what's registered with Google/Apple and
   what `APP_ORIGIN` is set to.
3. **Same constraint we already hit with passkeys/E2E** (see project memory): native
   crypto/identity flows are origin-bound to `tribes.app` and can't be exercised against a
   local build — you deploy to test them.

**Practical recommendation:**
- **Web (desktop / Android Chrome):** test locally with sandbox keys in `.env.local`.
- **Native app (iOS / Android):** deploy the sandbox keys to a **staging/preview
  environment** (or a guarded prod) that the app can point at, and test on-device there.
  The providers are env-gated and NSFW won't ship until the whole feature is done, so
  there's no exposure to real users in the meantime.
- **Going live:** swap sandbox keys for **production** RP credentials (full Google RP
  onboarding + ToS + prod cert; Apple prod RP setup). Production keys verify against
  production IACA roots.

---

## Quick reference

**Env vars** (see `config.ts`): `GOOGLE_WALLET_RP_ID`, `_READER_KEY_PEM`, `_READER_CERT_PEM`,
`_IACA_PEM`, `_RP_METADATA?`, `_DOCTYPE?`, `_NAMESPACE?` (same with `APPLE_WALLET_` prefix);
`APP_ORIGIN?`; `AGE_VERIFICATION_ALLOW_DEV` (staging only); `SESSION_SECRET` (required —
seals the verification state).

**Reset a user to re-test the gate:** `update users set age_verified_at = null,
age_verification_method = null where email = '...';`

**Safety:** never commit keys; sandbox keys are sandbox-only; keep the dev provider out of
production.
</content>
