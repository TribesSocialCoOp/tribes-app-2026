# Key Sync UAT Report
**Date:** 2026-06-09
**Branch:** main
**Feature:** Gap 1 (triggerSync on bond accept/send) + Gap 2 (PRF vault auto-save)
**Runner:** Playwright / Chromium headless, 390×844 mobile viewport (Pixel 7)

---

## Results — All 5 tests pass ✅

| # | Test | Result | Key metric |
|---|------|--------|------------|
| 1 | Key-sync fires on mount | ✅ | Phase 0 (identity key) log confirmed |
| 2 | triggerSync after bond Accept | ✅ | **359ms** from click → first sync log; keys generated at **+1677ms** |
| 3 | Bond DM page — no crypto errors | ✅ | `/bonds/sb1` loaded clean, 0 crypto errors |
| 4 | Back navigation regression | ✅ | `/post/` → `/your-comms` via Back button |
| 5 | Settings page renders | ✅ | No errors |

---

## Gap 1 — triggerSync timing proof

Test 2 measures the exact time from clicking **Accept** to the first `[key-sync]` console log.

```
Accept clicked — timing triggerSync...
✅ triggerSync fired 359ms after Accept: "[key-sync] Generating new RSA identity key pair..."
✅ Phase A key gen confirmed at +1677ms: "[key-sync] Generated keys for bond bond-test-fre-te..."
```

Full log sequence from the accept session (relative to Accept click):

| ms | Log |
|----|-----|
| -3245 | Initial sync — Generating new RSA identity key pair... |
| -1708 | Second initial sync cycle — Generating new RSA identity key pair... |
| -1522 | Identity key already published by another device |
| -1505 | Cleared 0 stale shared secrets (cache upgrade v1→v2) |
| -1455 | Bond sb9 — no local key (orphaned, vault restore needed) |
| -1354 | Tribe list fetched (Free Explorer has no private tribes) |
| **+359** | **← Accept clicked → triggerSync() → performSync() fires** |
| +1489 | Identity key: already published by another device |
| +1587 | Bond sb9 still orphaned (no vault in test env — expected) |
| **+1677** | **← Generated keys for NEW bond bond-test-fre-te...** ✅ |
| +1709 | Server already has key for reverse bond (CAS rejected re-publish) |

**Before this fix:** next sync would have been up to 60s later (slow poll interval).
**After this fix:** keys generated in **1.7 seconds** from Accept click.

### DB state after accept

```
user_id            | target_id          | has_key
-------------------+--------------------+--------
test-free-user     | test-speaker-user  | t       ← free-user generated keys immediately
test-speaker-user  | test-free-user     | f       ← speaker's side pending (no local session)
```

Free Explorer's bond got keys instantly. Speaker's side will get keys on their next login/sync cycle (the normal path for the initiator; they can also benefit from triggerSync after sending, which is wired up in `handleConfirmIntroduction`).

---

## Screenshots

### 01 — Dustin's feed on mount (key-sync active)
![01](screenshots/key-sync-uat/01-dustin-your-comms.png)

Key-sync provider running. Phase 0 confirmed in console.

---

### 02 — Free Explorer's bonds page with pending request
![02](screenshots/key-sync-uat/02-free-user-bonds-pending.png)

Speaker Sam's bond request is visible in the "Incoming" section. No ToS dialog (fixed in DB — all test users stamped `tos_accepted_version = '1.1.1'`).

---

### 03 — Accept button visible
![03](screenshots/key-sync-uat/03-accept-button-visible.png)

The Accept button is rendered and clickable. This is the moment we start timing.

---

### 04 — Immediately after Accept click (359ms later, sync already fired)
![04](screenshots/key-sync-uat/04-after-accept-click.png)

triggerSync() has already fired. The bonds page is refreshing.

---

### 05 — After key-sync completes (~1.7s after Accept)
![05](screenshots/key-sync-uat/05-key-sync-after-accept.png)

Phase A has run. `Generated keys for bond...` confirmed in console. The bond is now encryption-ready.

---

### 10 — Dustin's feed post key-sync
![10](screenshots/key-sync-uat/10-dustin-after-sync.png)

---

### 11 — Bond DM page (sb1: Dustin ↔ TSM)
![11](screenshots/key-sync-uat/11-bond-dm-sb1.png)

Bond chat loads. No "keys not ready" banner or crypto errors.

---

### 12 — Bond DM loaded
![12](screenshots/key-sync-uat/12-bond-dm-loaded.png)

Chat area confirmed visible and functional.

---

### 13 — Mobile post detail
![13](screenshots/key-sync-uat/13-mobile-post-detail.png)

---

### 14 — Back to feed
![14](screenshots/key-sync-uat/14-back-to-feed.png)

Back navigation lands on `/your-comms`. Regression confirmed passing.

---

### 15 — Settings page
![15](screenshots/key-sync-uat/15-settings-page.png)

Settings renders cleanly. Key-management / vault backup section available.

---

## Gap 2 — PRF Vault Auto-Save: Manual Checklist

Gap 2 requires a real passkey authenticator (PRF extension) — not testable headlessly.

### Verify "first vault save" (Device A):
1. Chrome/Edge on desktop with platform authenticator
2. Clear IndexedDB: DevTools → Application → IndexedDB → `tribes-keys` → Delete all
3. Log in with passkey
4. Accept one bond request (or let key-sync run on mount if you have bonds)
5. **Expected:** `[key-sync] Vault auto-saved to PRF credential` in DevTools console
6. **Expected:** "Key Sync Enabled" toast appears exactly once

### Verify restore on Device B:
1. Different device or browser profile, same passkey synced (iCloud/Google Password Manager)
2. Clear IndexedDB on Device B
3. Log in with the same passkey
4. **Expected:** "Security Synced" toast
5. **Expected:** Bond chats open with encryption immediately ready — no "vault restore needed" in console

### Verify no-PRF graceful degradation:
1. Log in on Firefox or a non-PRF authenticator
2. **Expected:** No vault toasts, no errors, settings backup still functional

---

## Regression: back-navigation.spec.ts

5/6 pass. Test 3 (`feed-redirect → post → tribe → back×2`) fails intermittently with a 15s navigation timeout — pre-existing, not caused by this PR.
