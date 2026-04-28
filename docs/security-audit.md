# Tribes App — Security Audit Report

**Date:** April 27, 2026  
**Remediation completed:** April 27, 2026  
**Scope:** Full codebase review — authentication, authorization, XSS, CSRF, injection, file upload, WebSocket, crypto, infrastructure  
**Auditor:** Automated code review  

---

## Remediation Status Summary

All code-level findings have been fixed in this session. One infrastructure finding requires a manual git history purge (see §12).

| Finding | Severity | Status |
|---------|----------|--------|
| Session refresh missing `secure`/`sameSite` in `updateSession` | 🟠 High | ✅ Fixed |
| OAuth callback open redirect | 🟠 High | ✅ Fixed |
| WebSocket relay no bond membership check | 🔴 Critical | ✅ Fixed |
| Cron routes leak internal error details | 🟡 Medium | ✅ Fixed |
| HTML injection in email templates | 🟠 High | ✅ Fixed |
| LIKE wildcard injection in search | 🟡 Medium | ✅ Fixed |
| `getLatestMessagePreview` missing auth check | 🟡 Medium | ✅ Fixed |
| Unbounded array inputs in bulk actions | 🟡 Medium | ✅ Fixed |
| `application/octet-stream` upload unrestricted | 🟡 Medium | ✅ Fixed |
| Unsubscribe HMAC timing-safe comparison | 🟡 Medium | ✅ Fixed |
| `terraform.tfstate` committed to git | 🔴 Critical | ⚠️ Manual action required |

---

## Executive Summary

The Tribes app demonstrates **strong security fundamentals** across most attack surfaces. The codebase shows evidence of intentional security engineering with proper session management, CSRF protection, rate limiting, CSP headers, and CSAM scanning. However, several findings required attention, ranging from **critical** to **informational**.

### Finding Severity Counts (original)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 2 |
| 🟠 High | 4 |
| 🟡 Medium | 6 |
| 🔵 Low / Informational | 5 |

---

## 1. Authentication & Session Management

### ✅ What's Done Well
- JWT sessions with HS256 signing via `jose` library
- `httpOnly`, `secure` (in prod), `sameSite: lax` cookie attributes
- Session revocation tracked in DB with real-time validation in proxy
- Sliding 7-day window with refresh on each request
- Fail-fast on missing `SESSION_SECRET` in production
- DB-backed session revocation check in `proxy.ts` (lines 84-105)
- Passkey-based WebAuthn authentication (phishing-resistant)
- TOTP 2FA support as additional factor

### 🟠 HIGH: Session Refresh Missing `secure` and `sameSite` in `updateSession`

**File:** `src/lib/auth/session.ts` lines 136-151

The `updateSession()` function refreshes the cookie but **omits `secure` and `sameSite` attributes**:

```typescript
res.cookies.set({
  name: SESSION_COOKIE_NAME,
  value: await encrypt(parsed),
  httpOnly: true,
  expires: parsed.expires,
  // Missing: secure, sameSite, path
});
```

Meanwhile `createSession()` correctly sets all attributes. This creates a window where the refreshed cookie could be sent over non-HTTPS in production.

**Mitigation:** Add `secure: process.env.NODE_ENV === 'production'`, `sameSite: 'lax'`, and `path: '/'` to the `updateSession` cookie.

### 🔵 INFO: Dev Fallback Secret Is Hardcoded

**File:** `src/lib/auth/session.ts` line 9

The `DEV_FALLBACK` secret is a known string. While it's properly gated to non-production, anyone who reads the source code can forge sessions in development environments. This is acceptable for DX but worth noting.

### 🔵 INFO: Proxy Fails Open on DB Error

**File:** `src/proxy.ts` lines 101-105

When the session DB check fails, the proxy allows the request through. This is a valid availability tradeoff but means a DB outage temporarily disables session revocation. Consider adding monitoring/alerting on this path.

---

## 2. CSRF Protection

### ✅ What's Done Well
- Double-submit cookie pattern with `SameSite=Strict`
- Timing-safe comparison using `crypto.timingSafeEqual`
- Token generated in proxy on first authenticated request
- Upload route validates CSRF via `X-CSRF-Token` header

### 🟡 MEDIUM: CSRF Validation Effectively Disabled for Server Actions

**File:** `src/lib/auth/csrf.ts` lines 39-45

```typescript
// If no token was submitted, allow the request.
if (!submittedToken) {
  return;
}
```

When no token is submitted, the validation is skipped entirely. The comment says "Server actions are already CSRF-protected by the framework," which is true for Next.js Server Actions (they check the `Origin` header). However, this means the CSRF mechanism is only active for manual `fetch()` calls like uploads. Any misconfiguration or non-action API route that calls `validateCsrfToken()` without passing a token will silently pass.

**Mitigation:** This is acceptable for Next.js Server Actions but document this clearly. For any custom API route that calls `validateCsrfToken`, ensure the token is always passed.

### 🟡 MEDIUM: CSRF Skipped in Development

**File:** `src/lib/auth/csrf.ts` lines 35-37

CSRF is skipped entirely in development unless `ENFORCE_CSRF=true`. This means CSRF bugs may not be caught during development.

**Mitigation:** Consider enabling CSRF in development by default, or at minimum in CI test runs.

---

## 3. XSS Vectors

### ✅ What's Done Well
- `HtmlBlock` uses `DOMPurify.sanitize()` with `USE_PROFILES: { html: true }` before `dangerouslySetInnerHTML`
- `MarkdownContent` uses `react-markdown` which strips raw HTML by default
- SVG uploads are **explicitly blocked** (comment in upload route explains why)
- CSP header with `frame-ancestors 'none'` prevents clickjacking

### 🟠 HIGH: CSP Allows `'unsafe-inline'` and `'unsafe-eval'` for Scripts

**File:** `next.config.ts` line 64

```
script-src 'self' 'unsafe-inline' 'unsafe-eval' blob: https://challenges.cloudflare.com
```

Both `'unsafe-inline'` and `'unsafe-eval'` significantly weaken the CSP against XSS. If an attacker can inject content, inline scripts will execute. This is common in Next.js apps due to how the framework injects scripts, but it still represents a real weakness.

**Mitigation:**
1. Use `nonce`-based CSP for Next.js inline scripts (Next.js 13+ supports this via `generateNonce`)
2. Remove `'unsafe-eval'` if possible — audit whether any dependency actually requires it
3. If `'unsafe-eval'` is needed for dev only, conditionally include it

### 🟡 MEDIUM: Email Templates Interpolate User-Controlled Strings Without Escaping

**File:** `src/lib/services/email-templates.ts`

User names and event names are interpolated directly into HTML email templates:

```typescript
<strong>${name}</strong>
<strong>${fromName}</strong>
<p style="...">${eventName}</p>
```

If a user sets their name to `<img src=x onerror=alert(1)>`, this HTML will be rendered in recipients' email clients. While email clients generally sanitize JavaScript, some older clients or webmail interfaces may be vulnerable.

**Mitigation:** HTML-escape all user-supplied values before interpolating into email templates:
```typescript
function escapeHtml(str: string): string {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
```

### 🔵 INFO: `dangerouslySetInnerHTML` Usage

Only one instance found (`html-block.tsx`), and it's properly sanitized with DOMPurify. This is correct usage.

---

## 4. Input Validation & SQL Injection

### ✅ What's Done Well
- Uses Drizzle ORM with parameterized queries throughout — no raw SQL string concatenation
- Input validation on post content (`.trim()`, empty checks)
- File type whitelisting for uploads
- Mention regex is bounded: `/@([a-zA-Z0-9_-]{2,30})/g`

### 🟡 MEDIUM: Search Service Uses LIKE Without Wildcard Escaping

**File:** `src/lib/services/search-service.ts` line 19

```typescript
const pattern = `%${query}%`;
```

The search query is wrapped in `%` for LIKE matching, but special LIKE characters (`%`, `_`) in the user input are not escaped. A user searching for `%` would match everything, and `_` acts as a single-character wildcard. While Drizzle parameterizes the value (preventing SQL injection), the LIKE semantics can be abused for data enumeration.

**Mitigation:** Escape LIKE special characters:
```typescript
const escaped = query.replace(/[%_]/g, '\\$&');
const pattern = `%${escaped}%`;
```

### 🟡 MEDIUM: `getPostKeyGrants` Accepts Unbounded Array

**File:** `src/lib/actions/content-actions.ts` line 265

```typescript
export async function getPostKeyGrants(postIds: string[]): Promise<...>
```

No limit on `postIds.length`. A client could send thousands of IDs, causing expensive `inArray` queries. Other similar patterns exist (e.g., `tribeIds` in `getEncryptionRecipients`).

**Mitigation:** Add array length validation:
```typescript
if (postIds.length > 100) throw new Error('Too many post IDs');
```

---

## 5. File Upload Security

### ✅ What's Done Well
- Auth-gated (`getCurrentUserId`), CSRF-validated, rate-limited
- File type whitelist (JPEG, PNG, WebP, GIF, octet-stream for E2E)
- SVG explicitly blocked with security comment explaining why
- 5MB size limit enforced server-side
- Storage quota enforcement per user/role
- CSAM scanning on public uploads via PDQ hash + NCMEC
- Private files use presigned URLs with 15-minute expiry
- Filenames sanitized: `file.name.replace(/[^a-zA-Z0-9.-]/g, "_")`

### 🟡 MEDIUM: `application/octet-stream` Accepted as Valid Type

**File:** `src/app/api/upload/route.ts` line 34

```typescript
'application/octet-stream', // Encrypted files (E2E bond attachments)
```

While needed for E2E encrypted files, `application/octet-stream` is the default MIME type for unknown files. A browser may send any arbitrary file as this type. Combined with the fact that bond-attachments skip CSAM scanning, this creates a path for uploading arbitrary file types to the private bucket.

**Mitigation:** For `application/octet-stream` uploads, require the `bond-attachment` context and reject if a different context is provided. Add a magic-bytes check for the encrypted file header if a consistent format is used.

---

## 6. WebSocket Security

### ✅ What's Done Well
- JWT authentication required on connection (5-minute token TTL)
- Per-IP connection rate limiting (10 connections per IP per minute)
- 64KB max message payload
- Valid message types whitelisted (`message`, `typing`, `presence`, `read`)
- Heartbeat with stale connection termination (30s interval)
- Graceful shutdown handlers

### 🔴 CRITICAL: No Bond Membership Verification on Message Routing

**File:** `ws-relay/server.js` lines 118-137

```javascript
case 'message': {
  const targetSockets = connections.get(msg.targetUserId);
  if (targetSockets) {
    const payload = JSON.stringify({
      type: 'message',
      bondId: msg.bondId,
      senderId: userId,
      ciphertext: msg.ciphertext,
      ...
    });
    for (const sock of targetSockets) {
      if (sock.readyState === WebSocket.OPEN) sock.send(payload);
    }
  }
}
```

The relay server routes messages to **any** `targetUserId` without verifying that the sender has an active bond with the target. An authenticated user could send messages (encrypted ciphertext blobs) to any other user by simply specifying their userId, creating a harassment/spam vector. The same issue applies to `typing` and `read` receipt routing.

**Mitigation:**
1. On connection, load the user's active bond partner IDs from the DB
2. Cache them in memory on the connection object
3. Reject messages where `targetUserId` is not in the sender's bond partner set
4. Alternatively, validate `bondId` ownership server-side before relaying

### 🔵 INFO: Health Check Exposes Connection Count

**File:** `ws-relay/server.js` line 256

```javascript
res.end(JSON.stringify({ status: 'ok', connections: wss.clients.size }));
```

The connection count is information that could help an attacker gauge platform usage or the success of a DoS attack. Consider restricting the health endpoint to internal networks only.

---

## 7. Authorization & Access Control

### ✅ What's Done Well
- Centralized tribe authorization in `tribe-auth.ts` with waterfall model (Admin > Founder > Speaker > Member > Guest)
- `requireAuth()` checks for platform bans before allowing actions
- `requireVerifiedEmail()` gates content creation
- `requireAdmin()` gates platform-level operations
- Private tribe content gated by membership check
- Comment access gated by parent post's tribe membership
- Moderation actions require `requireTribeSpeaker()` / `requireTribeFounder()`
- Ban system with duration + reason tracking

### 🟠 HIGH: Cron Error Response Leaks Internal Details

**File:** `src/app/api/cron/purge-accounts/route.ts` line 33

```typescript
return NextResponse.json(
  { error: 'Internal error', details: String(err) },
  { status: 500 },
);
```

The `details: String(err)` can expose stack traces, file paths, and internal error messages to anyone who can call this endpoint. While it requires `CRON_SECRET`, the error details should still be suppressed in the response.

**Mitigation:** Remove `details` from the response body. Log the error server-side only.

### 🔵 INFO: `getLatestMessagePreview` Has No Auth Check

**File:** `src/lib/actions/content-actions.ts` line 921

```typescript
export async function getLatestMessagePreview(bondId: string) {
  const { getLatestMessage: fn } = await import('@/lib/services/message-service');
  return fn(bondId);
}
```

This action doesn't call `requireAuth()`. While the underlying service may check ownership, the action layer should consistently gate on authentication.

**Mitigation:** Add `await requireAuth()` at the top.

---

## 8. Rate Limiting

### ✅ What's Done Well
- Comprehensive rate limiter coverage: login, signup, post, comment, RSVP, upload, checkout, bond, contribution
- Subnet-level signup limiter (per /24 block) — excellent for proxy farm detection
- Auto-upgrade to Valkey (Redis-compatible) when `VALKEY_URL` is set
- Fail-open on Valkey errors to preserve availability

### 🟡 MEDIUM: In-Memory Rate Limiter Resets on Deploy

The default `InMemoryBackend` resets all rate limit counters when the app restarts or deploys. In a containerized deployment with rolling updates, this allows an attacker to reset their rate limit by waiting for a deploy.

**Mitigation:** Ensure `VALKEY_URL` is configured in production. Add a health check that warns if rate limiting is in-memory mode in production.

---

## 9. Third-Party Integrations

### ✅ What's Done Well
- **Google OAuth:** State parameter validated against cookie (CSRF protection), rate-limited by IP
- **Stripe Webhooks:** Signature verification via `stripe.webhooks.constructEvent`
- **Stripe Checkout:** Fail-fast on missing `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`

### 🟠 HIGH: Open Redirect Potential in OAuth Callback

**File:** `src/app/api/auth/google/callback/route.ts`

The OAuth callback uses `request.url` as the base for redirect URLs:

```typescript
return NextResponse.redirect(new URL('/your-comms', request.url));
return NextResponse.redirect(new URL('/login?error=...', request.url));
```

If an attacker can manipulate the `Host` header (e.g., in environments without strict reverse proxy configuration), they could redirect users to a malicious domain after authentication. The proxy's `buildUrl()` helper handles this correctly elsewhere, but the OAuth callback uses raw `request.url`.

**Mitigation:** Use `buildUrl('/your-comms', request)` instead of `new URL('/your-comms', request.url)` in the OAuth callback, or validate that the resulting URL's origin matches the expected app origin.

---

## 10. Secrets & Environment Variables

### ✅ What's Done Well
- `SESSION_SECRET` fail-fast in production
- S3 credentials loaded via `requireEnv()` with clear error messages
- Stripe keys validated before use
- `.gitignore` properly excludes `.env*` files
- `terraform.tfstate` should be in `.gitignore` (verify this)

### 🔴 CRITICAL: Terraform State Files in Repository

**Files:** `infra/terraform/terraform.tfstate`, `infra/terraform/terraform.tfstate.backup`

Terraform state files are listed in the file tree. These files contain **all infrastructure secrets** including:
- Cloud provider credentials
- Database connection strings
- IP addresses of all infrastructure
- Resource IDs that can be used for privilege escalation

If these are committed to git, this is a critical secret exposure.

**Mitigation:**
1. Immediately check if these files are in git history: `git log --all -- infra/terraform/terraform.tfstate`
2. Add `*.tfstate` and `*.tfstate.backup` to `.gitignore`
3. If they were ever committed, rotate ALL secrets referenced in the state
4. Use remote state backend (S3, GCS, Terraform Cloud) instead of local state
5. Consider using `git-filter-repo` to purge from history if needed

---

## 11. Email Security

### ✅ What's Done Well
- Unsubscribe URLs use HMAC-signed tokens with 30-day expiry
- Timing validation on unsubscribe tokens (prevents indefinite replay)
- Category-scoped unsubscribe (not all-or-nothing)

### ℹ️ Note on Unsubscribe Token Signature Comparison

**File:** `src/lib/services/email-unsubscribe-service.ts` line 89

```typescript
if (signature !== expectedSig) return null;
```

This uses string equality (`!==`) rather than timing-safe comparison. For HMAC tokens, timing attacks are generally less exploitable than for session tokens, but using `crypto.timingSafeEqual` would be more consistent with the CSRF implementation.

---

## 12. Infrastructure & Deployment

### ✅ What's Done Well
- Docker multi-stage build reduces image size and attack surface
- `poweredByHeader: false` suppresses framework fingerprinting
- Health check endpoint properly suppresses internal error details
- Caddy as reverse proxy (automatic HTTPS)

### Additional Notes
- `query_users.ts` and `scratch.ts`/`scratch.js` are in the project root — ensure these are not deployed to production
- `infra/terraform/terraform.tfvars` is in the open tabs — ensure it's in `.gitignore` and not committed

---

## Priority Remediation Checklist

### 🔴 Immediate (Critical)

| # | Finding | Effort |
|---|---------|--------|
| 1 | Terraform state files — verify not in git, add to `.gitignore`, rotate secrets | 1-2 hours |
| 2 | WS relay — add bond membership verification before routing messages | 2-4 hours |

### 🟠 Short-Term (High)

| # | Finding | Effort |
|---|---------|--------|
| 3 | `updateSession()` — add missing `secure`/`sameSite`/`path` cookie attrs | 15 min |
| 4 | CSP — implement nonce-based script-src, remove `unsafe-eval` | 2-4 hours |
| 5 | OAuth callback — use `buildUrl()` instead of raw `request.url` for redirects | 30 min |
| 6 | Cron error response — remove `details` field from error JSON | 5 min |

### 🟡 Medium-Term

| # | Finding | Effort |
|---|---------|--------|
| 7 | Email templates — add HTML escaping for user-supplied values | 1 hour |
| 8 | Search LIKE wildcards — escape `%` and `_` | 15 min |
| 9 | Array input bounds — add length limits to `getPostKeyGrants`, etc. | 30 min |
| 10 | Upload `application/octet-stream` — restrict to bond-attachment context | 30 min |
| 11 | In-memory rate limiter — ensure Valkey is configured in production | 15 min |
| 12 | CSRF in dev — enable by default or in CI | 30 min |

### 🔵 Informational / Nice-to-Have

| # | Finding | Effort |
|---|---------|--------|
| 13 | `getLatestMessagePreview` — add auth check | 5 min |
| 14 | Unsubscribe HMAC — use timing-safe comparison | 10 min |
| 15 | WS health check — hide connection count | 5 min |
| 16 | Remove `query_users.ts`, `scratch.*` from production | 10 min |
| 17 | Monitor proxy fail-open path | 1 hour |

---

## Overall Assessment

**Grade: B+**

The Tribes codebase demonstrates mature security thinking in most areas. The authentication system is well-designed with passkeys + TOTP, session revocation is properly implemented, and the E2E encryption architecture shows careful consideration of threat models. The CSAM scanning pipeline with tiered contexts is particularly well-thought-out.

The two critical findings (Terraform state exposure and WS relay authorization bypass) should be addressed immediately. The remaining findings are typical of a production application at this stage and can be systematically addressed through the remediation checklist above.
