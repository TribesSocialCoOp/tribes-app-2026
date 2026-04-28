# Fix Plan — Post-Review Cleanup

Generated from diff review on 2026-04-27. All issues found in the current uncommitted changes vs last commit (`4b24b8f`).

---

## 🔴 Priority 1: Security Fixes

### 1.1 — Fix `btoa` stack overflow on large encrypted posts

**Problem:** `btoa(String.fromCharCode(...new Uint8Array(buffer)))` uses the spread operator to create a function call with N arguments. For buffers > ~50KB this throws `RangeError: Maximum call stack size exceeded`.

**Files:**
- `src/components/compose/compose-box.tsx:139`
- `src/lib/crypto/journal-encryption.ts:57`
- `src/lib/crypto/post-encryption.ts:50`

**Fix:** Replace with a chunked base64 helper. Since this is client-side code (not Node), use:

```typescript
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
```

Or create a shared utility in `src/lib/crypto/encoding.ts` and import it in all three files.

### 1.2 — Fix misleading `kwAlgo: 'AES-KW'` in file encryption metadata

**Problem:** `encryptFileWithKey()` in `src/lib/crypto/file-encryption.ts:276` sets `kwAlgo: 'AES-KW'` but actually uses AES-GCM wrapping. If any code path dispatches on `kwAlgo` to choose unwrap method, this will fail.

**File:** `src/lib/crypto/file-encryption.ts` (line ~276)

**Fix:** Change to `kwAlgo: 'AES-GCM'` and update the `decryptFileWithKey()` function to accept either value for backwards compatibility:

```typescript
// In encryptFileWithKey:
kwAlgo: 'AES-GCM',

// In decryptFile (if it checks kwAlgo):
// Accept both 'AES-KW' and 'AES-GCM' for backwards compat with any already-encrypted files
```

### 1.3 — Add validation to `declineReconnect()`

**Problem:** Unlike `approveReconnect()`, `declineReconnect()` doesn't check whether `bond.reconnectRequestedBy` is set before clearing it.

**File:** `src/lib/services/bond-service.ts` — `declineReconnect()`

**Fix:** Add guard:
```typescript
if (!bond.reconnectRequestedBy) throw new Error('No reconnect request to decline');
```

---

## 🟡 Priority 2: Duplication & DRY

### 2.1 — Extract `insertKeyGrants()` helper

**Problem:** Identical key-grant insertion logic appears twice in `content-actions.ts` (lines 171 and 228).

**File:** `src/lib/actions/content-actions.ts`

**Fix:** Extract a private helper function:
```typescript
async function insertKeyGrants(
  postId: string,
  keyGrants: Array<{ recipientId: string; bondId?: string; wrappedKey: string; wrapIv: string }>,
) {
  if (keyGrants.length === 0) return;
  const { postKeyGrants } = await import('@/db/schema');
  await db.insert(postKeyGrants).values(
    keyGrants.map(kg => ({
      id: `pkg-${postId}-${kg.recipientId}`,
      postId,
      recipientId: kg.recipientId,
      bondId: kg.bondId ?? null,
      wrappedKey: kg.wrappedKey,
      wrapIv: kg.wrapIv,
    }))
  );
}
```

Then call `await insertKeyGrants(primaryPost.id, payload.encryption.keyGrants)` in both places.

### 2.2 — Extract `hasImages()` helper

**Problem:** `(payload.imageUrl || (payload.imageUrls && payload.imageUrls.length > 0))` repeated 4+ times.

**Files:** `src/lib/actions/content-actions.ts`, `src/lib/services/post-service.ts`

**Fix:** Add to content-actions or a shared util:
```typescript
function hasImages(p: { imageUrl?: string | null; imageUrls?: string[] | null }): boolean {
  return !!(p.imageUrl || (p.imageUrls && p.imageUrls.length > 0));
}
```

### 2.3 — Extract `isActiveBond()` helper

**Problem:** `computePasskeyStatus()` is called inline with the same filtering pattern (check active/fading) in `getPostKeyGrants()`, `getEncryptionRecipients()`, and `sendMessage()`.

**File:** `src/lib/crypto/passkey-lifecycle.ts`

**Fix:** Add exported helper:
```typescript
export function isActiveBond(
  bond: Pick<Bond, 'expiresAt'>,
  rawBondType?: string,
  targetType?: string,
): boolean {
  const status = computePasskeyStatus(bond, rawBondType, targetType);
  return status === 'active' || status === 'fading';
}
```

---

## 🟡 Priority 3: Stale Naming Cleanup

### 3.1 — Rename `familyIntroEmail` → `innerCircleIntroEmail`

**Files:**
- `src/lib/services/email-templates.ts:234` — rename function
- `src/lib/services/email-templates.ts:12` — update JSDoc comment
- `src/lib/services/bond-service.ts:887` — update import name

**Fix:** Rename function and update all references. The email body content should also be reviewed for any "family" language.

### 3.2 — Update `CommunicationItem.type` union

**File:** `src/lib/types.ts:281`

**Current:** `type: "family-bond" | "regular-bond" | "mood-stream" | "ring-post"`

**Fix:** Update to `"inner-circle-bond" | "person-bond" | "mood-stream" | "ring-post"` and update all consumers. Search for `"family-bond"` to find all references:
```bash
grep -rn '"family-bond"' --include="*.ts" --include="*.tsx" src/
```

### 3.3 — Rename `maxFamilyBonds` in bonds-context

**File:** `src/app/(app)/bonds/bonds-context.tsx`

**Fix:** Rename `maxFamilyBonds` → `maxBondsLimit` (or just `maxBonds`) in the context value interface, state, and all consumers.

---

## 🟡 Priority 4: Dead Code Cleanup

### 4.1 — Remove empty blank line in bond-service

**File:** `src/lib/services/bond-service.ts` (around line 275)

**Fix:** Remove the stray blank line left after removing the family bond paywall check.

### 4.2 — Unused import check

**Action:** Run a quick check for unused imports in the changed files:
```bash
npx tsc --noEmit 2>&1 | grep "declared but"
```

---

## 🟡 Priority 5: Performance (N+1 Queries)

### 5.1 — Batch `getRecentConversations()`

**File:** `src/lib/actions/content-actions.ts`

**Problem:** For each of N bonds, it does 2 DB queries (peer bond lookup + latest message). 50 bonds = 100 queries.

**Fix:** 
1. Fetch all user bonds in one query
2. Fetch all peer bonds in one `inArray` query
3. Fetch latest messages per bond using a subquery or window function

### 5.2 — Batch `getMyTribesList()`

**File:** `src/lib/actions/content-actions.ts`

**Problem:** Loops through each membership row with individual tribe lookups.

**Fix:** Replace with a single join:
```typescript
const results = await db.select({
  id: tribes.id,
  name: tribes.name,
  slug: tribes.slug,
  description: tribes.description,
  cover: tribes.cover,
  isPublic: tribes.isPublic,
  members: tribes.memberCount,
  brandColor: tribes.brandColor,
}).from(tribeMembers)
  .innerJoin(tribes, eq(tribeMembers.tribeId, tribes.id))
  .where(eq(tribeMembers.userId, userId));
```

### 5.3 — Batch `getUnreadCount()`

**File:** `src/lib/services/message-service.ts`

**Problem:** Loops through each bond with a separate count query.

**Fix:** Use a single aggregate query with `inArray` for bond IDs, then separately handle peer bond resolution in batch.

---

## 🟡 Priority 6: TypeScript Best Practices

### 6.1 — Replace `Record<string, unknown>` with typed update objects

**Files:**
- `src/lib/services/bond-service.ts` (lines 103, 764, `toggleInnerCircle`)

**Fix:** Use `Partial<typeof bonds.$inferInsert>` or define explicit update types.

### 6.2 — Create WebAuthn PRF type augmentation

**Files:**
- `src/app/(auth)/login/page.tsx`
- `src/app/(auth)/signup/page.tsx`

**Fix:** Create `src/types/webauthn-prf.d.ts`:
```typescript
declare module '@simplewebauthn/browser' {
  interface AuthenticationExtensionsClientOutputs {
    prf?: {
      results?: {
        first?: ArrayBuffer;
        second?: ArrayBuffer;
      };
    };
  }
}
```

Then remove the `@ts-expect-error` comments.

### 6.3 — Standardize dynamic imports in server actions

**Observation:** Some functions use top-level imports for `db`, `schema`, `drizzle-orm`; others use `await import()`. Both patterns work, but mixing them in the same file is inconsistent.

**Recommendation:** For `content-actions.ts`, the new functions (`getPostKeyGrants`, `getEncryptionRecipients`, `getRecentConversations`) all use dynamic imports while older functions use top-level. Align to one pattern per file — for server actions that are tree-shaken per-endpoint, top-level imports are fine.

---

## Execution Order

| Phase | Items | Risk | Effort |
|-------|-------|------|--------|
| **Phase 1** | 1.1, 1.2, 1.3 | High severity, minimal blast radius | ~30 min |
| **Phase 2** | 2.1, 2.2, 2.3 | Low risk refactors | ~20 min |
| **Phase 3** | 3.1, 3.2, 3.3 | Low risk, needs grep verification | ~20 min |
| **Phase 4** | 4.1, 4.2 | Zero risk cleanup | ~5 min |
| **Phase 5** | 5.1, 5.2, 5.3 | Medium risk (query changes) | ~45 min |
| **Phase 6** | 6.1, 6.2, 6.3 | Low risk, type improvements | ~20 min |

**Total estimated effort: ~2.5 hours**
