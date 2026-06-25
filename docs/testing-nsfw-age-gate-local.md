# Testing the NSFW Age Gate Locally (before deploy)

How to exercise the whole age-gate — tiers, opt-in, verify, blur, geo, native — on
your machine + emulators before shipping. Issue #32. See also
`docs/plan-age-geo-policy.md`.

## The model in one line
NSFW is hidden by default. Region decides the rule: **open** (no law → self-attest
opt-in) · **verify** (27 US law states → Google Wallet) · **blocked** (UK). Plus
blur-by-default on adult media. All of it is driven by `resolveNsfwAccess`.

## What's testable where
| Layer | Locally? | How |
|---|---|---|
| Policy logic (tiers/decisions) | ✅ fully | `npm test` (unit matrix) |
| Geo IP→region resolution | ✅ | `npm run check:geoip` |
| Tier switching without real geo | ✅ | `x-tribes-geo` header (no restart) or `AGE_GEO_OVERRIDE` env |
| Full web flow (opt-in, gate screens, blur, discovery) | ✅ | `npm run dev` |
| **Automated browser E2E** (opt-in DB round-trip, all 3 tiers, keystore migration, key-sync) | ✅ | `npx playwright test` (see §4) |
| Verify (Google Wallet) pass/fail | ⚠️ partial | dev provider stub (real wallet needs a device + credential) |
| Native header + web-only enforcement + native render/blur | ✅ | Android emulator / iOS simulator |
| Real geo-IP, real Google Wallet, geoipupdate cron | ❌ | prod only |

---

## 0. Prereqs (`.env.local`)
Already set this session: `GEOIP_DB_PATH=…/geoip/GeoLite2-City.mmdb`. Also ensure:
- `SESSION_SECRET` is set (seals verification state).
- `DEV_BYPASS_SECRET=local-dev-only` — enables the dev quick-login buttons (the
  Playwright E2E + emulator flows log in via the **Dustin** button, not passwords).
- To exercise the **verify** tier without a real wallet, enable the dev provider:
  ```
  AGE_VERIFICATION_ALLOW_DEV=true   # non-prod only; never in production
  ```

The dev Postgres runs in Docker as `tribes-app-2026-postgres-dev-1` (the E2E DB
helper `psql`s into it directly).

## 1. Policy unit tests (fastest signal)
```
npm test -- src/lib/geo/age-policy.test.ts
```
Confirms every law state → `verify`, UK → `blocked`, no-law/unknown → `open`, and the
27-state list hasn't drifted. Run the full `npm test` (111 unit tests) before any deploy.

## 2. Geo resolution (IP → region → tier)
```
npm run check:geoip                      # built-in sample across tiers
npm run check:geoip -- 129.7.0.1 1.2.3.4 # specific IPs
```
Expect e.g. `129.7.0.1 → US-TX [verify]`, `212.58.224.0 → GB [blocked]`,
`128.101.101.101 → US-MN [open]`.

## 3. Web flow (`npm run dev` → http://localhost:9002)
> Localhost requests resolve to a private IP → **unknown → open**. Two ways to
> simulate a tier:
> - **`x-tribes-geo` request header** (non-prod only) — per-request, **no restart**.
>   Easiest for ad-hoc checks (e.g. a browser header-override extension) and what the
>   E2E tests use (`x-tribes-geo: US-KS`).
> - **`AGE_GEO_OVERRIDE` env** — process-wide; **requires a dev restart** to change.

1. **Log in** with the dev **Dustin** quick-login button (passkeys are origin-bound to
   tribes.app, so they don't work locally — see Native caveat). Email+password also works.
2. **Opt-in:** Settings → **Adult Content** → toggle on (web-only; this is the
   self-attest). Toggle **Blur Adult Media** to test both states.
3. **Tier walk-through** — set the header/env, retry an NSFW tribe:
   - unset / `US-CA` → **open**: opted-in user sees NSFW; not opted-in sees the
     "enable adult content" gate.
   - `US-KS` (or `US-TX`) → **verify**: gate shows "Verify your age to continue"
     (Google Wallet). With `AGE_VERIFICATION_ALLOW_DEV=true`, complete the dev
     provider to unlock.
   - `GB` → **blocked**: gate shows "Not available in your region".
4. **Create / join** an NSFW tribe in each tier — confirm create + join are gated the
   same way (region_blocked / verify / opt-in messages).
5. **Blur:** in an NSFW tribe with image posts, media is blurred with "tap to reveal"
   (header images reveal as a group; inline `[img:N]` images per-image). Turn off
   "Blur Adult Media" in Settings → media shows unblurred.
6. **Discovery:** with adult content off (or in a blocked region), NSFW tribes do NOT
   appear in search or the tribe list; with it on (open region), they do.

## 4. Automated browser E2E (Playwright)
The age-gate and key-sync changes ship with browser E2E specs. They drive a real
Chromium against the running dev server, log in via the **Dustin** dev button, set the
region via the `x-tribes-geo` header, and assert DB round-trips by `psql`-ing the dev
Postgres. **The full dev server (next + relay) must be up**, and Docker Postgres running.

```
npm run dev                                              # terminal 1 (next + relay)
npx playwright test tests/nsfw-age-gate.spec.ts          # terminal 2 — age gate (6)
npx playwright test tests/nsfw-age-gate.spec.ts -g region   # gate tiers only
# Related branch specs (key lifecycle):
npx playwright test tests/keystore-migration.spec.ts        # v5→v7 IDB upgrade, no data loss
npx playwright test tests/multi-device-key-sync.spec.ts
npx playwright test tests/tribe-key-distribution-repro.spec.ts
```

`nsfw-age-gate.spec.ts` covers: the Settings adult-content opt-in **DB round-trip**,
plus all three region tiers (open ×2, verify, verify-allowed, blocked). The login
helper is resilient to the dev-login cookie-commit race (it retries via
`expect(...).toPass()` rather than sleeping), so these are stable to run back-to-back.

> **First run is slow** (dev first-compile). If a run hangs with the dev server pegging
> CPU, see Troubleshooting below — it's almost always a stale Turbopack cache.

## 5. Android emulator
One command boots an emulator (if none is running) + runs the app via **live-reload**
against your dev server (so the WebView loads localhost and you can iterate):
```
npm run dev                          # in one terminal (relay + next)
./scripts/run-native.sh android      # boots emulator + cap run --live-reload
#   ANDROID_AVD=Pixel_8_API_35 ./scripts/run-native.sh android   # pick an AVD
#   CAP_HOST=192.168.1.50 ./scripts/run-native.sh android        # force host IP
```
**Mode: DEV.** Live-reload points the Capacitor WebView at your `npm run dev` server
(`http://<LAN-IP>:9002`) — it is NOT a production bundle. You get the dev build
(Turbopack, HMR) inside the native shell; only the native layer is `cap sync`'d. To
test an actual production bundle you'd build/sync without `--live-reload` (see §7).

Log in with the **dev login button (Dustin)** — passkeys won't work over live-reload
(origin-bound to tribes.app). What this proves that web can't:
- **`X-Tribes-Surface: android` header** — the Settings adult-content toggle is hidden
  in-app and the server rejects an in-app opt-in attempt ("enable on the website").
- Native rendering of the gate screens + blur.
- (Google Wallet ZKP can work on a real Android with Play + a wallet credential; the
  emulator usually lacks a real mDL, so use the dev provider for the flow.)

## 6. iOS simulator
```
npm run dev                       # in one terminal
./scripts/run-native.sh ios       # needs a booted Simulator (open one in Xcode)
```
**Mode: DEV** (live-reload against the dev server, same as Android).
- **`X-Tribes-Surface: ios` header** → same web-only opt-in enforcement + native
  render/blur.
- **Verify tier on iOS:** Google Wallet is unavailable in WKWebView, so the gate shows
  the "verify in a browser at tribes.app — it unlocks the app" note. Confirm that copy
  appears (don't expect in-app wallet verification).

## ⚠️ Native login caveat
Passkey / E2E login is origin-bound to `tribes.app`, so a **local** native build can't
complete passkey login. Options: (a) use the **Dustin dev login button** in the native
build, or (b) test the gate logic on **web** (fully functional) and use the emulators
just to verify the **native header, rendering, and blur**. Full logged-in native
verification of the wallet path is best done against the deployed backend.

## 7. Troubleshooting: dev server pegs CPU / `/settings` hangs
If `npm run dev` pins the CPU (next-server at hundreds of %, RAM climbing) and a route
never finishes compiling, it's a **corrupted Turbopack `.next` cache** — NOT the relay,
the front-end, or app code. Common after switching branches with large diffs or killing
dev mid-compile. **Fix:**
```
rm -rf .next && npm run dev
```
Quick triage: `pgrep -f next-server` then `ps -p <pid> -o %cpu,rss`. If next-server is
hot and `ws-relay/server` is ~0%, it's the build cache, not the relay.

## 8. Pre-deploy checklist
- [ ] `npm test` green (111 unit tests) · `npx tsc --noEmit` clean
- [ ] `npm run check:geoip` resolves sample IPs to the right tiers
- [ ] E2E green: `npx playwright test tests/nsfw-age-gate.spec.ts` (+ the 3 key-sync specs)
- [ ] Web: opt-in, all three tiers (via `x-tribes-geo`), blur on/off, discovery hide
- [ ] Android emulator: in-app opt-in rejected (web-only), native render + blur
- [ ] iOS simulator: verify-tier shows the web-verify note, native render + blur
- [ ] Remove `AGE_GEO_OVERRIDE` / `AGE_VERIFICATION_ALLOW_DEV` before shipping
- [ ] Prod has `GEOIPUPDATE_*` creds (or rsync'd `.mmdb`) so the gate isn't inert
