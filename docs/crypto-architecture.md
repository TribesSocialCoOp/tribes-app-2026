# Tribes.app — Cryptographic Architecture

> **Status:** Living document. Last updated 2026-04-27.

This document covers the end-to-end encryption (E2EE) infrastructure for Tribes.app:
how keys are generated, stored, exchanged, and (soon) synced across devices.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Key Hierarchy](#key-hierarchy)
3. [Bond Key Exchange (ECDH)](#bond-key-exchange-ecdh)
4. [Journal Encryption](#journal-encryption)
5. [Post Encryption (Sender Key Model)](#post-encryption-sender-key-model)
6. [Client-Side Key Storage](#client-side-key-storage)
7. [Vault Backup (Passphrase — Legacy)](#vault-backup-passphrase--legacy)
8. [Vault Recovery via Passkey PRF (Planned)](#vault-recovery-via-passkey-prf-planned)
9. [Connected Devices & Multi-Device Sync](#connected-devices--multi-device-sync)
10. [Threat Model & Mitigations](#threat-model--mitigations)

---

## Design Principles

1. **Server-blind:** The server never sees plaintext content or private keys. All
   encrypted blobs are opaque to the backend.
2. **Browser-native:** All crypto uses the Web Crypto API (`crypto.subtle`). No
   third-party crypto libraries.
3. **Local-first:** Reads hit the local IndexedDB keystore. The server stores
   encrypted backup blobs for cross-device recovery only.
4. **Graceful degradation:** If crypto APIs or IndexedDB are unavailable, the app
   functions without encryption rather than crashing.

---

## Key Hierarchy

```
User
├── Personal Journal Key (AES-256-GCM)
│   └── Encrypts/decrypts journal ring posts
│
├── Bond Key Pairs (ECDH P-256) — one per bond
│   ├── Private Key → stored in IndexedDB (non-extractable)
│   ├── Public Key  → stored on server (bonds.public_key_jwk)
│   └── Shared Secret = ECDH(my.private, peer.public) → HKDF → AES-256-GCM
│       └── Used to wrap per-post keys (Sender Key Model)
│
└── PRF Vault Wrapping Key (derived from passkey, planned)
    └── AES-256-GCM key derived via HKDF from WebAuthn PRF output
    └── Encrypts the vault backup blob stored on the server
```

---

## Bond Key Exchange (ECDH)

**Algorithm:** ECDH with P-256 (NIST curve, universal browser support)

**Flow:**
1. When Alice initiates a bond with Bob, her browser generates an ECDH key pair
2. Alice's public key (JWK) is sent to the server and stored in `bonds.public_key_jwk`
3. Bob accepts the bond → his browser generates a key pair → his public key is stored
4. Both sides now have: their own private key (IndexedDB) + peer's public key (server)

**Shared Secret Derivation:**
```
ECDH(Alice.private, Bob.public) → 256-bit raw bits
  → HKDF(SHA-256, salt=zeros, info="tribes.app/bond-key/v1")
  → AES-256-GCM key (non-extractable)
```

Both Alice and Bob derive the identical shared secret independently.

**Source:** `src/lib/crypto/key-manager.ts`

---

## Journal Encryption

Journal posts are the most private content — encrypted with a personal symmetric key.

**Key:** AES-256-GCM, 256-bit, `extractable: true` (for vault backup)

**Storage:** Stored in the same IndexedDB keystore as bond keys, under the well-known
ID `__personal_journal_key__`.

**Encryption:** Standard AES-256-GCM with a random 96-bit IV per entry. The ciphertext
and IV are stored as base64 in the `posts` table.

**Source:** `src/lib/crypto/journal-encryption.ts`

---

## Post Encryption (Sender Key Model)

Ring-scoped posts (inner_circle, my_people) use a **Sender Key Model:**

1. Author generates a random AES-256-GCM **post key** (per-post, ephemeral)
2. Post content is encrypted with the post key → `posts.ciphertext`
3. The post key is **wrapped** (encrypted) for each recipient using their
   bond shared secret → stored in `post_key_grants` table
4. Self-grant: author wraps the post key with their journal key (so they can
   re-read their own posts)

**Decryption (recipient side):**
```
wrapped_key → AES-GCM-decrypt(shared_secret, wrap_iv) → raw post key
ciphertext  → AES-GCM-decrypt(post_key, content_iv)   → plaintext
```

**Source:** `src/lib/crypto/post-encryption.ts`

---

## Client-Side Key Storage

**Database:** IndexedDB, database name `tribes_keystore`, object store `bond_keys`

**Schema:**
```typescript
interface StoredBondKey {
  bondId: string;        // Key path (primary key)
  privateKey: CryptoKey; // Opaque handle — never serialized to JS
  publicKeyJwk: JsonWebKey;
  createdAt: number;
  rotatedAt?: number;
}
```

**Security properties:**
- Keys created with `extractable: false` cannot be exported, even by JavaScript
- The browser manages the actual key material in a separate memory region
- IndexedDB is origin-scoped — only `tribes.app` can access it
- Clearing browser data / switching devices = keys are gone

**Source:** `src/lib/crypto/key-store.ts`

---

## Vault Backup (Passphrase — Legacy)

> **Note:** This mechanism exists but has zero usage in production (0 vault backups
> as of 2026-04-27). It is being superseded by PRF-based vault recovery.

**Flow:**
1. User provides a recovery passphrase (≥8 chars)
2. `PBKDF2(passphrase, random_salt, 600K_iterations, SHA-256)` → AES-256-GCM key
3. All bond private keys + journal key are exported to JWK and encrypted
4. Encrypted blob + salt are stored in `vault_backups` table
5. On new device: user enters passphrase → vault decrypted → keys restored

**Source:** `src/lib/crypto/vault-backup.ts`, `src/lib/services/vault-service.ts`

---

## Vault Recovery via Passkey PRF (Planned)

### Overview

The WebAuthn **PRF (Pseudo-Random Function) extension** replaces the passphrase
with a hardware-derived secret. When the user authenticates with FaceID/TouchID,
the secure enclave produces a deterministic 32-byte output that we use to derive
the vault wrapping key. **No passphrase to remember.**

### How PRF Works

The PRF extension piggybacks on the standard WebAuthn `get()` ceremony:

```javascript
const assertion = await navigator.credentials.get({
  publicKey: {
    ...standardOptions,
    extensions: {
      prf: {
        eval: {
          first: applicationSalt  // Static, app-scoped salt
        }
      }
    }
  }
});

// Extract the PRF output (32 bytes, deterministic per credential + salt)
const prfOutput = assertion.getClientExtensionResults().prf.results.first;
```

The PRF output is:
- **Deterministic:** Same credential + same salt = same output, every time
- **Credential-bound:** Different passkeys produce different outputs
- **Hardware-backed:** Generated inside the secure enclave, never exposed
- **Server-blind:** The server never sees the PRF output

### Key Derivation

```
PRF output (32 bytes)
  → importKey('raw', prfOutput, 'HKDF')
  → deriveKey(HKDF, SHA-256, salt=[], info="tribes.app/prf-vault/v1")
  → AES-256-GCM wrapping key (non-extractable)
```

### Flow Diagrams

#### Registration (First Device)

```
User signs up
  → Browser: navigator.credentials.create({extensions: {prf: {}}})
  → Authenticator: Creates credential, signals PRF support
  → Browser: Generate bond keys → store in IndexedDB
  → (No vault upload yet — keys are local-only)
```

#### Vault Creation (First Encrypted Post)

```
User creates first encrypted post
  → Browser: navigator.credentials.get({prf: {eval: {first: salt}}})
  → Authenticator: Returns assertion + PRF output (32 bytes)
  → Browser: HKDF(PRF output) → AES-256-GCM wrapping key
  → Browser: Export all keys from IndexedDB → encrypt with wrapping key
  → Browser → Server: Upload encrypted vault blob (tagged with credentialId)
  → Server: Store in key_vaults table
```

#### Key Recovery (New Device Login)

```
User logs in on new device with passkey
  → Browser: navigator.credentials.get({prf: {eval: {first: salt}}})
  → Authenticator: Returns assertion + same PRF output
  → Browser: HKDF(PRF output) → same wrapping key
  → Browser → Server: Fetch encrypted vault blob for this credentialId
  → Server → Browser: Encrypted vault
  → Browser: Decrypt vault → import keys into IndexedDB
  → 🔓 All encrypted content now decryptable
```

### Platform Support (as of April 2026)

| Platform | PRF Support | Notes |
|----------|------------|-------|
| Chrome (macOS 15+) | ✅ | Via iCloud Keychain |
| Safari 18+ | ✅ | Native support |
| Chrome (Android) | ✅ | Via Google Password Manager |
| Firefox 139+ | ✅ | Recent addition |
| Chrome (Windows 11) | ✅ | Via Windows Hello (25H2+) |
| Older security keys | ❌ | Fallback to passphrase vault |

### Fallback Strategy

If PRF is unavailable (older authenticator, unsupported browser):
1. Login succeeds normally (PRF is optional)
2. User is prompted to set up a recovery passphrase (existing flow)
3. Message in feed: "🔒 Keys not synced. Set up a recovery passphrase in Settings."

---

## Connected Devices & Multi-Device Sync

### Architecture: Join Table Model

Key vaults are stored in a dedicated `key_vaults` join table that maps
credentials to encrypted vault blobs:

```sql
CREATE TABLE key_vaults (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT,            -- WebAuthn credential ID (NULL for passphrase vaults)
  vault_type    TEXT NOT NULL,    -- 'prf' | 'passphrase'
  encrypted_vault BLOB NOT NULL, -- Opaque encrypted blob
  salt          TEXT NOT NULL,    -- HKDF salt (PRF) or PBKDF2 salt (passphrase)
  created_at    INTEGER,
  updated_at    INTEGER
);

-- Index for fast lookup by user + credential
CREATE INDEX idx_key_vaults_user_credential
  ON key_vaults(user_id, credential_id);
```

**Why a join table?**
- One user can have many credentials (phone, laptop, security key)
- Each credential produces a unique PRF output → unique vault blob
- Adding/revoking devices is a simple INSERT/DELETE on this table
- The passphrase vault is just another row (`vault_type = 'passphrase'`, `credential_id = NULL`)
- Clean separation from the legacy `vault_backups` table (can drop later)

### Scaling Considerations

**Per-credential blobs** means `N` rows per user where `N` = number of registered
passkeys. In practice:
- Most users have 1-3 passkeys (phone, laptop, maybe a security key)
- Each vault blob is small (~2-5 KB for typical key counts)
- The join table grows linearly with users × credentials
- SQLite handles millions of rows easily; this won't be a bottleneck

**Key rotation:** When a new bond key is created, the vault needs to be re-encrypted
for all credentials. This is an `O(credentials)` operation triggered on:
- New bond formation
- Bond key rotation
- New journal key creation

We batch this: after any key change, re-encrypt and upload for the *current* credential
only. Other credentials get updated on their next login.

---

## Threat Model & Mitigations

| Threat | Mitigation |
|--------|-----------|
| Server compromise (DB dump) | All vault blobs are encrypted. Server never has wrapping keys. |
| XSS (malicious script) | Non-extractable CryptoKey handles can't be read by JS. CSP headers block inline scripts. |
| Man-in-the-middle | All traffic over TLS (Caddy auto-provision). HSTS preload. |
| Passkey deletion | User loses PRF-derived key. Mitigated by: multiple credentials, passphrase fallback, UI warnings. |
| Lost device | Keys are in IndexedDB (device-local). Vault on server allows recovery from any other registered credential. |
| Compromised authenticator | PRF output is unique per credential. Revoking a credential's vault row invalidates that attack vector. |
| Replay attack on PRF | PRF salt is static but output is credential-bound. The WebAuthn ceremony itself prevents replay (challenge-response). |

---

## File Map

| File | Layer | Purpose |
|------|-------|---------|
| `src/lib/crypto/key-manager.ts` | Client | ECDH key gen, export/import, HKDF derivation, AES-GCM encrypt/decrypt |
| `src/lib/crypto/key-store.ts` | Client | IndexedDB CRUD for bond private keys |
| `src/lib/crypto/journal-encryption.ts` | Client | Personal journal AES-256-GCM key management |
| `src/lib/crypto/post-encryption.ts` | Client | Sender Key Model: per-post key gen, wrap/unwrap |
| `src/lib/crypto/vault-backup.ts` | Client | PBKDF2 passphrase-based vault encrypt/decrypt (legacy) |
| `src/lib/crypto/prf-vault.ts` | Client | **[Planned]** PRF-based vault encrypt/decrypt |
| `src/lib/crypto/index.ts` | Client | Public API barrel exports |
| `src/lib/auth/passkeys.ts` | Server | WebAuthn registration/authentication ceremonies |
| `src/lib/services/vault-service.ts` | Server | Vault blob persistence (DB read/write) |
| `src/lib/actions/vault-actions.ts` | Server | Server actions for vault operations |
| `src/hooks/use-post-decryption.ts` | Client | React hook for feed-level decryption |
| `src/db/schema.ts` | Server | `vault_backups` table, `key_vaults` table (planned) |
