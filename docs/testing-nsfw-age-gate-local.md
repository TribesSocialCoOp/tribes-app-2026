# Testing the NSFW Age Gate Locally (before deploy)

How to exercise the whole age-gate — tiers, opt-in, verify, blur, geo, native — on
your machine + emulators before shipping. Issue #32. See also
`docs/plan-age-geo-policy.md`.

## The model in one line
NSFW is hidden by default. Region decides the rule: **open** (no law → self-attest
opt-in) · **verify** (26 US law states → Google Wallet) · **blocked** (UK). Plus
blur-by-default on adult media. All of it is driven by `resolveNsfwAccess`.

## What's testable where
| Layer | Locally? | How |
|---|---|---|
| Policy logic (tiers/decisions) | ✅ fully | `npm test` (unit matrix) |
| Geo IP→region resolution | ✅ | `npm run check:geoip` |
| Tier switching without real geo | ✅ | `AGE_GEO_OVERRIDE` env |
| Full web flow (opt-in, gate screens, blur, discovery) | ✅ | `npm run dev` |
| Verify (Google Wallet) pass/fail | ⚠️ partial | dev provider stub (real wallet needs a device + credential) |
| Native header + web-only enforcement + native render/blur | ✅ | Android emulator / iOS simulator |
| Real geo-IP, real Google Wallet, geoipupdate cron | ❌ | prod only |

---

## 0. Prereqs (`.env.local`)
Already set this session: `GEOIP_DB_PATH=…/geoip/GeoLite2-City.mmdb`. Also ensure
`SESSION_SECRET` is set (seals verification state). To exercise the **verify** tier
without a real wallet, enable the dev provider:
```
AGE_VERIFICATION_ALLOW_DEV=true   # non-prod only; never in production
```

## 1. Policy unit tests (fastest signal)
```
npm test -- src/lib/geo/age-policy.test.ts
```
Confirms every law state → `verify`, UK → `blocked`, no-law/unknown → `open`, and the
26-state list hasn't drifted. Run the full `npm test` before any deploy.

## 2. Geo resolution (IP → region → tier)
```
npm run check:geoip                      # built-in sample across tiers
npm run check:geoip -- 129.7.0.1 1.2.3.4 # specific IPs
```
Expect e.g. `129.7.0.1 → US-TX [verify]`, `212.58.224.0 → GB [blocked]`,
`128.101.101.101 → US-MN [open]`.

## 3. Web flow (`npm run dev` → http://localhost:9002)
> Localhost requests resolve to a private IP → **unknown → open**. Use
> `AGE_GEO_OVERRIDE` to simulate each tier (restart dev after changing it).

1. **Log in** with email + password (passkeys are origin-bound to tribes.app, so use
   password locally — see Native caveat below).
2. **Opt-in:** Settings → **Adult Content** → toggle on (web-only; this is the
   self-attest). Toggle **Blur Adult Media** to test both states.
3. **Tier walk-through** — set the env, restart `npm run dev`, retry an NSFW tribe:
   - `AGE_GEO_OVERRIDE` unset or `US-CA` → **open**: opted-in user sees NSFW; not
     opted-in sees the "enable adult content" gate.
   - `AGE_GEO_OVERRIDE=US-KS` (or `US-TX`) → **verify**: gate shows "Verify with
     Google Wallet". With `AGE_VERIFICATION_ALLOW_DEV=true`, complete the dev
     provider to unlock.
   - `AGE_GEO_OVERRIDE=GB` → **blocked**: gate shows "Not available in your region".
4. **Create / join** an NSFW tribe in each tier — confirm create + join are gated the
   same way (region_blocked / verify / opt-in messages).
5. **Blur:** in an NSFW tribe with image posts, media is blurred with "tap to reveal"
   (header images reveal as a group; inline `[img:N]` images per-image). Turn off
   "Blur Adult Media" in Settings → media shows unblurred.
6. **Discovery:** with adult content off (or in a blocked region), NSFW tribes do NOT
   appear in search or the tribe list; with it on (open region), they do.

## 4. Android emulator
One command boots an emulator (if none is running) + runs the app via **live-reload**
against your dev server (so the WebView loads localhost and you can iterate):
```
npm run dev                          # in one terminal (relay + next)
./scripts/run-native.sh android      # boots emulator + cap run --live-reload
#   ANDROID_AVD=Pixel_8_API_35 ./scripts/run-native.sh android   # pick an AVD
#   CAP_HOST=192.168.1.50 ./scripts/run-native.sh android        # force host IP
```
Log in with the **dev login button (email/password)** — passkeys won't work over
live-reload (origin-bound to tribes.app). What this proves that web can't:
- **`X-Tribes-Surface: android` header** — the Settings adult-content toggle is hidden
  in-app and the server rejects an in-app opt-in attempt ("enable on the website").
- Native rendering of the gate screens + blur.
- (Google Wallet ZKP can work on a real Android with Play + a wallet credential; the
  emulator usually lacks a real mDL, so use the dev provider for the flow.)

## 5. iOS simulator
```
npm run dev                       # in one terminal
./scripts/run-native.sh ios       # needs a booted Simulator (open one in Xcode)
```
- **`X-Tribes-Surface: ios` header** → same web-only opt-in enforcement + native
  render/blur.
- **Verify tier on iOS:** Google Wallet is unavailable in WKWebView, so the gate shows
  the "verify in a browser at tribes.app — it unlocks the app" note. Confirm that copy
  appears (don't expect in-app wallet verification).

## ⚠️ Native login caveat
Passkey / E2E login is origin-bound to `tribes.app`, so a **local** native build can't
complete passkey login. Options: (a) use **email+password** login in the native build,
or (b) test the gate logic on **web** (fully functional) and use the emulators just to
verify the **native header, rendering, and blur**. Full logged-in native verification
of the wallet path is best done against the deployed backend.

## 6. Pre-deploy checklist
- [ ] `npm test` green · `npx tsc --noEmit` clean
- [ ] `npm run check:geoip` resolves sample IPs to the right tiers
- [ ] Web: opt-in, all three tiers (via `AGE_GEO_OVERRIDE`), blur on/off, discovery hide
- [ ] Android emulator: in-app opt-in rejected (web-only), native render + blur
- [ ] iOS simulator: verify-tier shows the web-verify note, native render + blur
- [ ] Remove `AGE_GEO_OVERRIDE` / `AGE_VERIFICATION_ALLOW_DEV` before shipping
- [ ] Prod has `GEOIPUPDATE_*` creds (or rsync'd `.mmdb`) so the gate isn't inert
