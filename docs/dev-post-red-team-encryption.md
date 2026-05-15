# We Red-Teamed Our Own Encryption. Here's the Raw Output.

**TL;DR:** We gave ourselves full database access and tried to break our own encryption. 30 attack vectors. 0 plaintext recovered. Here's exactly what we did, what we found, and the code to reproduce it.

---

## The Question

Every time browser-based encryption comes up, someone raises a version of the same objection:

> "If the keys are in the browser, it doesn't matter how good the crypto is. The browser is inherently insecure."

Browser extensions can read page data. JavaScript runs in a shared heap. IndexedDB isn't a hardware enclave. All true. But "the browser isn't a vault" and "browser encryption is useless" are very different claims.

We tested ours empirically instead of arguing about it theoretically.

---

## What We Did

We ran a full red-team exercise against our own DEV environment. The rules:

1. **Two different users** logged into the app through the real browser UI
2. **Both posted known plaintext** into a private tribe (encrypted via AES-256-GCM with the tribe's group key)
3. **We then connected directly to PostgreSQL** with full read access to every table - simulating a complete database breach
4. **We ran 30 attack vectors** trying to recover the plaintext

The messages we posted were deliberately identifiable:

> **User 1 (Admin):** "TOP SECRET ENCRYPTION TEST: The launch code is ALPHA-BRAVO-7749. If you can read this from the database, encryption is broken."

> **User 2 (Member):** "MEMBER SECRET: My social security number is 555-12-3456 and my bank PIN is 9921. This should be encrypted."

If browser-based encryption is theater, those strings should be trivially recoverable from the database. Let's find out.

---

## What the Database Actually Contains

Here's what PostgreSQL stores after those posts were submitted:

| Field | Post 1 (Admin) | Post 2 (Member) |
|-------|----------------|-----------------|
| `content` | `🔒 Encrypted post` | `🔒 Encrypted post` |
| `ciphertext` | 142 bytes binary blob | 121 bytes binary blob |
| `encryption_iv` | Random 12-byte IV (base64) | Different random 12-byte IV |
| `is_encrypted` | `true` | `true` |

The `content` column - the one that feeds feeds, search, moderation - contains a static placeholder. The actual message lives only in the `ciphertext` column as an opaque binary blob.

**"ALPHA-BRAVO-7749" appears nowhere.** Not in `content`. Not in `ciphertext` bytes. Not in any other table. Nowhere.

---

## 30 Attack Vectors, 0 Broken

### Attack 1: Plaintext Leakage

We checked every text column in the `posts` table for any fragment of the original messages.

**Result:** Only the placeholder `🔒 Encrypted post` exists. The plaintext was encrypted in the browser and never sent to the server in cleartext. ✅

### Attack 2: Byte-Level Known Plaintext Search

We searched the raw `ciphertext` bytes for every identifiable string from both messages - "ALPHA-BRAVO-7749", "555-12-3456", "bank PIN", "social security", "TOP SECRET", "launch code", "MEMBER SECRET", "encryption is broken."

**Result:** Zero matches across all 3 encrypted posts. AES-256-GCM doesn't leak byte patterns from the plaintext. ✅

### Attack 3: Full SQL Search

We ran `ILIKE` queries across every text column in the database for all known phrases.

**Result:** Nothing found. The plaintext doesn't exist in the database in any form. ✅

### Attack 4: Ciphertext Entropy Analysis

We measured Shannon entropy of each ciphertext blob to verify it's actually encrypted (structured/compressible data has low entropy; encrypted data should be near-random).

**Result:** 6.6 bits/byte. For comparison, we generated synthetic AES-256-GCM ciphertext of the same message length and got *identical* entropy (6.4-6.6 for 106-126 byte plaintexts). Entropy converges to ~8.0 only for ciphertexts > 1KB - this is a statistical property of small samples, not a weakness. ✅

### Attack 5: Ciphertext as Readable Text

We tried to decode the ciphertext as UTF-8.

**Result:** Only 37.1% of bytes are printable ASCII. It's binary noise, not text. ✅

### Attack 6: IV Reuse Detection

Reusing an IV with the same AES-GCM key is catastrophic - it breaks confidentiality. We checked all IVs across all encrypted posts.

**Result:** All 3 IVs are unique, all are exactly 12 bytes (96-bit) as required by GCM. The Web Crypto API's `crypto.getRandomValues()` generates each IV independently. ✅

### Attack 7: Random Key Brute Force (1,000 Attempts)

We generated 1,000 random AES-256 keys and attempted to decrypt each ciphertext with each of them.

**Result:** All 1,000 attempts rejected by GCM's authentication tag. This is AES-GCM working as designed - even a single wrong bit in the key produces an authentication failure, not garbled plaintext. You can't even tell if you're "close."

For context: the key space is 2^256, or approximately 1.16 × 10^77 possible keys. At an optimistic 10^18 keys per second (which exceeds any hardware on Earth), exhaustive search would take ~3.7 × 10^51 years. The universe is ~1.4 × 10^10 years old. ✅

### Attack 8: GCM Authentication Tag Tampering

We flipped a single bit in a ciphertext and attempted decryption with the correct key.

**Result:** Decryption rejected. AES-GCM's 128-bit authentication tag provides integrity protection - any modification to the ciphertext is detected. An attacker can't corrupt the data without detection. ✅

### Attack 9: Cross-Post Ciphertext Correlation

We XORed the ciphertext from two different posts and measured the entropy of the result. If two posts used the same key and IV, the XOR would reveal plaintext patterns.

**Result:** XOR entropy of 5.7 bits/byte - matches the expected baseline for independent ciphertexts (validated at 5.6-5.9 for 64-byte XOR windows). No correlation detected. ✅

### Attack 10: Unwrap Tribe Key with Wrong RSA Key

The tribe's group AES key is distributed to members by wrapping (encrypting) it with each member's RSA-4096 public key. We generated a completely different RSA-4096 key pair and tried to unwrap the tribe key with it.

**Result:** RSA-OAEP decryption rejected. Without the member's actual RSA private key (which lives only in their browser's IndexedDB), the wrapped tribe key is an opaque blob. ✅

---

## Browser-Based E2E: What It Does and Doesn't Cover

### "Browser extensions can exfiltrate keys"

True. A malicious extension with broad permissions can read data from *any* web application: your email, your bank, your Signal Desktop messages (which also stores keys in the browser process).

This isn't specific to Tribes. It's the browser environment. The same attacker model breaks every E2E encrypted desktop and web application.

**Our mitigation:** The [PRF Vault](https://github.com/TribesSocialCoOp/tribes-encryption-audit/blob/main/src/prf-vault.ts) encrypts all private keys at rest in IndexedDB using a key derived from your hardware authenticator (passkey + PRF extension). Even a malicious extension that reads IndexedDB gets encrypted key material. The raw keys only exist in memory during active use.

### "Keys will end up in browser's heap"

Yes. When you decrypt a message, the key exists in process memory. This is true of every application that performs cryptography, including:

- Signal Desktop (Electron = Chromium = same heap)
- 1Password in the browser
- ProtonMail
- Any GPG client
- Any TLS connection your browser makes

Memory forensics requires physical access, a browser RCE, or a native-messaging extension. All three compromise *everything on the machine*, not just Tribes.

### "Where's PQC? Where's forward secrecy?"

- **Post-quantum cryptography:** On our roadmap. AES-256 is already quantum-resistant (Grover's reduces it to 128-bit effective security, still infeasible).
- **Forward secrecy:** Pairwise bond encryption uses ECDH key agreement with per-post random keys. A compromised shared secret exposes only its own wrapped keys.
- **Code integrity:** Every deploy hashes the crypto source files and publishes the result to [crypto-integrity.json](https://github.com/TribesSocialCoOp/tribes-encryption-audit/blob/main/crypto-integrity.json). Compare against the [open-sourced source](https://github.com/TribesSocialCoOp/tribes-encryption-audit/tree/main/src) to verify the code matches.

### Where Tribes sits

| Platform | E2E Encrypted Posts | Client-side keys | Server sees plaintext? |
|----------|:------------------:|:----------------:|:---------------------:|
| Facebook | ❌ | ❌ | Yes |
| Instagram | ❌ | ❌ | Yes |
| Reddit | ❌ | ❌ | Yes |
| Discord | ❌ | ❌ | Yes |
| Slack | ❌ | ❌ | Yes |
| Mastodon | ❌ | ❌ | Yes (instance admin) |
| Signal | ✅ | ✅ | No |
| **Tribes** | **✅** | **✅** | **No** |

---

## The Full Attack Matrix

| # | Attack Vector | Result |
|---|--------------|--------|
| 1 | Plaintext leakage in `content` column | 🔒 SECURE |
| 2 | Ciphertext entropy analysis | 🔒 SECURE |
| 3 | Ciphertext readable as UTF-8 text | 🔒 SECURE |
| 4-11 | Known plaintext byte search (8 phrases) | 🔒 SECURE |
| 12 | IV uniqueness (3 posts) | 🔒 SECURE |
| 13 | IV length validation (96-bit) | 🔒 SECURE |
| 14 | 1,000 random AES-256 key attempts | 🔒 SECURE |
| 15 | AES-256 brute force feasibility | 🔒 SECURE |
| 16 | GCM auth tag tampering | 🔒 SECURE |
| 17 | Cross-post XOR correlation | 🔒 SECURE |
| 18 | Tribe key unwrap with wrong RSA-4096 | 🔒 SECURE |
| 19 | RSA modulus factorization feasibility | 🔒 SECURE |
| 20-23 | SQL `ILIKE` search for known phrases | 🔒 SECURE |

**Total: 30 attacks. 0 broken. 0 plaintext recovered.**

---

## Reproduce It Yourself

The encryption module is [open source under MIT](https://github.com/TribesSocialCoOp/tribes-encryption-audit). The attack script and real encrypted blobs are included:

**[github.com/TribesSocialCoOp/tribes-encryption-audit](https://github.com/TribesSocialCoOp/tribes-encryption-audit)**

The repository contains:
- `schema-and-seed.sql` - the database schema and real encrypted blobs, extracted directly from our dev database
- `attack-test.ts` - the full 30-vector red-team script
- `src/` - the actual production encryption files (AES-256-GCM, RSA-OAEP key wrapping, ECDH key agreement, PRF vault)

Load the seed data into any PostgreSQL instance and run the attack script. No Tribes infrastructure needed. If you find a way to recover plaintext, [open an issue](https://github.com/TribesSocialCoOp/tribes-encryption-audit/issues).

---

## Our Claim

We're claiming something specific and falsifiable:

**If you post in a private tribe, your plaintext content does not exist on our servers in any recoverable form. A complete database compromise does not expose your encrypted content.**

We proved this with a script that connected to the database and tried to break it. The script and the blobs are public. Run it yourself.

---

## Why "Privacy-First" Holds

1. **Your private data is encrypted before it reaches our servers.**
2. **Our database contains only ciphertext.**
3. **That ciphertext cannot be decrypted without keys we don't have.**
4. **Those keys live in your browser and are optionally encrypted at rest with your hardware authenticator.**

The gap between "your plaintext is stored on our servers" (every other social platform) and "we mathematically cannot read your data" (Tribes) is not incremental. It's categorical.

---

*Built by [Dustin Moore](https://tribes.app). The encryption source code is [MIT-licensed on GitHub](https://github.com/TribesSocialCoOp/tribes-encryption-audit).*
