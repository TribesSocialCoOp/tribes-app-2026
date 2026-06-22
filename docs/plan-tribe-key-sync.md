# Plan: Reliable, Observable Tribe Key Distribution

**Status:** For review
**Branch:** `feat/nsfw-age-gate-phase0` (or a dedicated `feat/tribe-key-sync` branch)
**Author:** Dustin
**Context:** Private/NSFW tribes use client-side E2E group keys. A founder holding the key,
logged in on the device that holds it, failed to grant a new member ("Speaker Sam") even
after waiting well past the 15s sync timer. This plan fixes the reliability, makes the whole
process noisy/observable, and exposes founder/member key-session + backup state in the UX.

---

## Hard constraints (from product owner)

1. **No plaintext tribe keys on the server, ever.** The server only ever holds RSA-wrapped
   grants and plaintext *metadata* (who is waiting, key versions, timestamps). This is the
   whole point of private tribes. (Managed-tribe / server-held keys = explicitly deferred.)
2. **Logged-in is the only requirement.** A member should get access by simply being logged
   in; no manual steps, no SQL, no "ask an admin to do X."
3. **Make it noisy.** Both directions: a member waiting for keys must see honest status, and
   any key-holder who *can* grant (founder/speaker/admin) must be told someone is waiting.
4. **Expose key-session + backup state to the founder.** Tribe keys are local; we added them
   to the vault backup but never surfaced any of it. The founder needs to clearly see "this
   tribe's key is / isn't present in this session" and "this tribe's key is / isn't backed up."
5. **Defer:** opt-in "managed tribe" with server-side keys, and MLS/TreeKEM. Not now.

---

## Diagnosis (what's actually wrong)

### Finding 1 — Phase C is correct; the cycle starves it. *(root cause of the reported bug)*
- Sam (`test-speaker-user`) **has** a published `encryption_public_key` and is a tribe member
  with no device keys. `getUngrantedDevices()` returns him as a legacy target; Phase C's
  legacy path (`getMemberEncryptionKeys`) returns his key with the correct shape
  (`Record<userId, JWK>`), read correctly as `memberPublicKeys[target.userId]`. **So the grant
  should issue.** (This disproves the "Sam never published a key" theory.)
- The cycle (`performSync` in `key-sync-provider.tsx`) runs **Phase V (PRF vault pull) → 0
  (identity key) → 0.5 (device reg) → A (bonds) → B (tribe grant pull) → C (tribe grant
  distribute)** inside one big `try`. **Phases V, 0, 0.5, and A are NOT individually wrapped.**
  If any throws (vault pull error, a bonds network hiccup, an identity-key race), control jumps
  to the outer `catch` and **B and C never run.** Deterministic errors → permanent starvation
  of tribe-key distribution. Logged only at `console.debug`/`warn` → invisible.
- This is the same class of failure that made the **timer-based chat sync** a "nightmare" — one
  early step failing silently blocks everything after it.

### Finding 2 — It's timer-driven; chat already proved the fix is sockets.
- Tribe distribution relies on adaptive polling (15s for 2 min, then 60s) + a `triggerSync()`
  on tribe entry. Chat moved to **event/socket-driven** sync (`ws-client.ts` + `ws-relay/
  server.js`): `triggerSync()` on bond-accept, live **presence** per channel, and a server→relay
  **internal push** (`pushToUserSocket`, `/internal/push`) for `feed-update`/`activity`, with
  polling kept only as a safety net. Tribe keys never got this treatment.

### Finding 3 — No "someone is waiting" signal on private tribes.
- Approval-join notifies the owner. But a successful **join** to a private tribe creates no
  durable record that "user X awaits a key for tribe Y," so nobody is told to grant, and there's
  no work-queue to drive notifications, retries, or admin UI.

### Finding 4 — Founder/member key state is invisible.
- `hasTribeKey` exists in `tribe-detail-context` (members see a "Cryptographic Sync Pending"
  banner). But there is **no** founder-facing signal "this tribe's key is not in this session,"
  and **no** per-tribe "key backed up: yes/no," even though the data exists: `getTribeKey()`,
  `StoredTribeKey.version/receivedAt`, vault freshness (`getVaultBackupDate`,
  `getVaultStatusAction`), and tribe keys are already in the vault payload
  (`vault-backup.ts`/`prf-vault.ts`).

### Finding 5 — Local key cache isn't user-scoped (separate issue, include the cheap fix).
- `tribes_keystore` IndexedDB `tribe_keys` store is keyed by `tribeId` only and **not cleared on
  logout** (logout drops only the in-memory vault key; `clearAllKeys()` is unused and even it
  only clears `bond_keys`). On a shared browser, user B can read user A's cached tribe keys, and
  it contaminates multi-account testing (this is why "test-service-admin" self-granted earlier).

---

## Design principles

- **Event-first, poll as safety net.** Mirror chat: a join/promotion *pushes* work to online
  key-holders immediately; the existing timer stays only as a backstop.
- **Durable work-queue, zero-knowledge.** A server record of *who is waiting* (metadata only)
  is the backbone for notifications, retries, and UI. No key material added server-side.
- **Fail loud, fail isolated.** No phase can silently starve another; key failures surface to
  the user/admin instead of `console.debug`.
- **Honest UX both ways.** Waiting members and capable granters both always know the state.

---

## Workstreams

### WS-1 — Reliability: stop the silent starvation *(highest priority; fixes the actual bug)*
Files: `src/components/providers/key-sync-provider.tsx`
1. **Isolate every phase** in its own `try/catch` so V/0/0.5/A failures can't abort B/C. Each
   phase logs a structured warning and continues.
2. **Promote visibility:** the "no public key / skipping grant" and per-phase failures move from
   `console.debug` to a surfaced diagnostic (see WS-4) and `console.warn`.
3. **Watchdog the lock:** ensure `syncLock` can't wedge the loop (it's released in `finally`
   today, but add a max-duration guard so a hung `await` can't freeze all future cycles).
4. **Order independence:** run B and C even when A (bonds) fails — tribe keys must not depend on
   bond-key health.

### WS-2 — Event-driven distribution over the socket *(the "do what chat did" fix)*
Files: `ws-relay/server.js`, `src/lib/ws-client.ts`, `src/lib/services/realtime-dispatch.ts`,
`src/components/providers/key-sync-provider.tsx`, join/promote server actions.
1. **New relay message types & routing:** `tribe-key-request` (member → online granters of a
   tribe) and `tribe-key-available` (granter → member, "pull now"). Reuse the existing
   per-user routing and the internal `/internal/push` API.
2. **Server-push on join/promotion:** when a member joins a private tribe (or is promoted to
   speaker), `pushToUserSocket` every online founder/speaker/admin → their client immediately
   runs a targeted Phase-C grant pass for that tribe. No 15–60s wait.
3. **Member nudge on entry:** when a keyless member opens a private tribe, emit
   `tribe-key-request`; any online granter fulfills on the spot; the member's client pulls via
   the existing Phase B and a `tribe-key-available` nudge.
4. **Tribe presence (optional, if needed):** track `tribePresence: tribeId → Set<userId>` so a
   requester can tell whether any granter is online right now (drives the "we've notified N
   admins, none are online" messaging in WS-4).
5. Keep the adaptive timer as the **safety net** only.

### WS-3 — Durable "awaiting key" work-queue + notifications
Files: new migration (additive), `src/lib/services/tribe-key-service.ts`, notification dispatch,
join/promote actions.
1. **Record on join:** a member joining a private tribe with no active grant creates a durable
   "awaiting key" record (a new table or a status column; metadata only). Cleared when their
   grant is issued.
2. **Notify granters:** founder + speakers + platform admins get an in-app (and push)
   notification: "N members are waiting for access to *Tribe*." Reuses the existing notification
   system. This is the persistent backstop when no granter is online for the socket path.
3. **Admin "Grant now":** a button that force-runs the Phase-C pass for that tribe (manual
   override / reassurance).
4. **Retry:** the queue is the source of truth for re-attempts; once a grant exists, dequeue.

### WS-4 — UX: make session + backup state visible (both roles)
Files: `tribe-feed-section.tsx`, `tribe-detail-context.tsx`, tribe settings/admin dashboard,
`vault-backup-section.tsx`, possibly `key-sync-banner.tsx`.
1. **Member waiting state (upgrade the existing banner):** show whether a granter is online
   ("An admin has been notified" vs "An admin is online — finishing now…"), and a manual retry.
2. **Founder "key not in this session" banner:** when a founder/admin opens a private tribe and
   `getTribeKey(tribeId)` is null on this device → clear banner: "This device doesn't hold this
   tribe's key. Restore from your backup to manage it," with a restore CTA. (Today this is the
   silent dead-end that produces a dead granter.)
3. **Per-tribe encryption status card** (tribe settings/admin): key version + created date,
   **"backed up to your vault: ✓/✗"**, last sync, and **"members awaiting access: N"** with the
   "Grant now" action.
4. **Vault section:** add a "Tribe encryption keys" list (per-tribe backed-up state) alongside
   the existing bond-key/vault status.

### WS-5 — User-scope the local key cache (cheap correctness + clean testing)
Files: `src/lib/crypto/key-store.ts`, `src/components/layout/user-nav.tsx` (logout).
1. Namespace `tribe_keys` (and `shared_secrets`/`bond_keys`) by `userId`, **or** call a
   corrected `clearAllKeys()` (fix it to clear *all* stores) on logout.
2. This closes the shared-browser leak and removes the testing confound where a second account
   reads the first's cached key.

---

## Testing strategy (multi-user, automated)

Manual two-browser testing is what made this painful and contaminated (shared IndexedDB).
Use **Playwright + the dev server** to script the real multi-user exchange in isolated browser
contexts (separate storage per context = separate IndexedDB):

1. Harness: launch `npm run dev`; in Playwright, **one browser context per user** (founder,
   speaker, new member), each logging in via the dev bypass.
2. Scenarios:
   - Founder creates private tribe → posts → assert ciphertext-at-rest in DB.
   - New member joins → assert: "awaiting key" record created; granter notified; grant row
     `granted_by = founder` appears; member's context flips `hasTribeKey → true`; member
     decrypts the post. **This is the test that was impossible to trust by hand.**
   - Founder offline → member joins → assert waiting-state UX + queued notification; founder
     comes online → assert auto-grant.
   - Speaker (non-founder, holds key) can grant; speaker without key cannot (and sees the
     "key not in this session" banner).
   - Reliability: inject a Phase-V/A failure → assert Phase C still grants (WS-1).
3. Assert both **UI state** (banners/badges) and **DB state** (`tribe_key_grants`, queue table).

---

## Suggested sequencing

1. **WS-1** (reliability/isolation) + **WS-5** (cache scoping) — small, high-impact, unblock
   correct testing. Land first.
2. **WS-3** (work-queue + notifications) — the durable backbone.
3. **WS-2** (socket push) — turns "eventually" into "immediately."
4. **WS-4** (UX) — layer the visibility on top of the now-reliable machinery.
5. Build the **Playwright harness** alongside WS-1 so every later change is regression-tested.

---

## Explicitly out of scope (for later)

- Server-side/escrowed tribe keys ("managed tribe"). Weakens the model; revisit deliberately.
- MLS/TreeKEM group keying. Large; only if availability still bites after the above.
