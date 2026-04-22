# Production Secrets Runbook

> **Purpose**: Checklist for rotating and securing secrets before any production deployment.

---

## Critical Secrets

| Secret | Where to Generate | Notes |
|---|---|---|
| `SESSION_SECRET` | `openssl rand -hex 32` | Must be ≥32 chars. App refuses to start in production without it. |
| `STRIPE_SECRET_KEY` | [Stripe Dashboard](https://dashboard.stripe.com/apikeys) | Replace `sk_test_*` with `sk_live_*` for production. |
| `STRIPE_WEBHOOK_SECRET` | Stripe Dashboard → Webhooks | Create a new webhook endpoint pointing to your production URL. |
| `GOOGLE_CLIENT_SECRET` | [GCP Console](https://console.cloud.google.com/apis/credentials) | **Rotate immediately** — dev secret may be in backups. |
| `S3_SECRET_ACCESS_KEY` | Your S3 provider (SeaweedFS / R2 / GCS) | Generate a new key pair for production. |

## Optional Secrets

| Secret | When Needed |
|---|---|
| `CRON_SECRET` | When deploying the event-reminder cron job. Generate with `openssl rand -hex 16`. |
| `TURSO_AUTH_TOKEN` | When using managed Turso (not needed for local sqld). |
| `SMTP_USER` / `SMTP_PASS` | When sending real transactional emails (SES, Postmark, etc.). |

## Storage Recommendations

### Phase 1 (Single Node)
```bash
# systemd service file using EnvironmentFile
[Service]
EnvironmentFile=/etc/tribes/production.env
```

### Phase 2+ (Managed Services)
- **GCP**: Use [Secret Manager](https://cloud.google.com/secret-manager) + buildpack integration
- **Doppler**: Zero-change integration via `doppler run -- npm start`
- **Vercel/Firebase**: Built-in environment variable management

## Pre-Launch Checklist

- [ ] `SESSION_SECRET` is a fresh random value (not the dev fallback)
- [ ] Stripe keys are live-mode (`sk_live_*`, `pk_live_*`)
- [ ] Stripe webhook endpoint points to production URL
- [ ] Google OAuth redirect URI updated to production domain
- [ ] Google OAuth client secret rotated
- [ ] S3 credentials are production-specific
- [ ] `.env.local` is in `.gitignore` AND `.dockerignore`
- [ ] No secrets are committed to git history
