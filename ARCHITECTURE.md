# Tribes.app — Architecture Guide

> **Last updated**: 2026-04-01 | **Stack**: Next.js 15 · React 19 · Drizzle ORM · LibSQL/Turso · Garage S3

---

## Overview

Tribes.app is a local-first, privacy-centric social platform built around **Tribes** (communities), **Bonds** (cryptographic relationships), and **Mood Streams** (interest-based discovery). The architecture prioritizes:

- **Local-first data**: SQLite via LibSQL with optional Turso cloud sync
- **Zero external dependencies for UI**: All assets are local SVGs, no CDN/placeholder services
- **Domain-driven server actions**: 7 domain modules replace a monolithic action file
- **Co-located component decomposition**: God Components replaced with Context + useReducer patterns

---

## Directory Structure

```
src/
├── ai/                         # Genkit AI flows
│   └── flows/                  # 6 flows: assistant, event/tribe description gen, etc.
├── app/                        # Next.js App Router
│   ├── (app)/                  # Authenticated app routes (26 pages)
│   ├── (auth)/                 # Login + Signup
│   ├── (onboarding)/           # Family/Event onboarding flows
│   └── page.tsx                # Landing / redirect
├── components/
│   ├── dialogs/                # Modal dialogs (all use <ResponsiveDialog>)
│   ├── icons/                  # Custom icon components
│   ├── layout/                 # AppShell, Sidebar, TopBar
│   ├── maps/                   # Interactive map (CSS gradient placeholder)
│   ├── settings/               # Settings section components
│   ├── sheets/                 # Mobile bottom sheets
│   ├── ui/                     # shadcn/ui primitives
│   └── wall-blocks/            # My Wall block types
├── db/
│   ├── index.ts                # Drizzle client (LibSQL)
│   ├── schema.ts               # 34 tables (see Schema section)
│   └── seed.ts                 # Seed script (npx tsx src/db/seed.ts)
├── hooks/                      # Custom React hooks (use-toast, use-mobile, etc.)
├── lib/
│   ├── actions/                # Domain-specific server actions (7 modules)
│   │   ├── shared.ts           # requireAuth, getCurrentUserId, trackContribution
│   │   ├── auth-actions.ts     # Sessions, WS tokens, CAPTCHA
│   │   ├── tribe-actions.ts    # Tribe CRUD, membership, join requests
│   │   ├── bond-actions.ts     # Bond lifecycle, key exchange, blocking
│   │   ├── event-actions.ts    # Events, RSVP, stream posts
│   │   ├── content-actions.ts  # Posts, comments, vibes, search, messaging, moderation
│   │   └── profile-actions.ts  # User profile, vault, billing, invites, wall
│   ├── auth/                   # Auth utilities
│   │   ├── session.ts          # JWT creation/verification (jose)
│   │   ├── passkeys.ts         # WebAuthn registration/authentication
│   │   ├── captcha.ts          # Proof-of-work CAPTCHA
│   │   ├── csrf.ts             # CSRF token generation/validation
│   │   └── rate-limit.ts       # In-memory rate limiting
│   ├── data-access/            # Direct DB query functions
│   │   ├── tribes.ts           # getMyTribeIds, getMyTribes
│   │   └── stories.ts          # Story queries
│   ├── services/               # 19 service modules (business logic)
│   │   ├── bond-service.ts     # Bond lifecycle (522 lines)
│   │   ├── event-service.ts    # Events, RSVP, stream posts
│   │   ├── post-service.ts     # Post CRUD, promotion
│   │   ├── s3-service.ts       # Garage S3 uploads
│   │   ├── session-service.ts  # DB-backed sessions
│   │   └── ... (14 more)
│   ├── actions.ts              # Documentation-only marker (deprecated barrel)
│   ├── auth-actions.ts         # WebAuthn registration/login actions
│   ├── constants.ts            # VIBE_EMOTICONS, shared constants
│   ├── mock-data.ts            # Seed data definitions
│   ├── moods-data.ts           # 11 mood stream definitions
│   ├── placeholder-svg.ts      # SVG generation utilities
│   ├── types.ts                # Shared TypeScript types (255 lines)
│   ├── utils.ts                # timeSince, cn, shared helpers
│   └── ws-client.ts            # WebSocket client
├── proxy.ts                    # Route protection (JWT verify, CSRF, session refresh)
└── types/                      # Global type declarations
```

---

## Data Layer

### Database: LibSQL + Drizzle ORM

- **Local**: SQLite file via `libsql` driver
- **Cloud sync**: Optional Turso sync (`TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN`)
- **ORM**: Drizzle with `drizzle-orm/sqlite-core`
- **Migrations**: `drizzle-kit push` for schema sync

### Schema (34 tables)

| Domain | Tables |
|---|---|
| **Identity** | `users`, `userAliases`, `credentials`, `sessions`, `oauthAccounts`, `vaultBackups` |
| **Subscription** | `plans`, `subscriptions`, `inviteCodes`, `inviteRedemptions`, `contributions` |
| **Bonds** | `bonds`, `bondRequests`, `blockedUsers` |
| **Communities** | `tribes`, `tribeMoodTags`, `tribeMembers`, `pendingMembers` |
| **Content** | `posts`, `postMoodTags`, `comments`, `vibes`, `reports` |
| **Personal** | `wallBlocks`, `wallStyles`, `userPreferences` |
| **Discovery** | `events`, `eventRsvps`, `eventStreamPosts`, `stories`, `storyArticles`, `storyComments` |
| **Messaging** | `messages` |
| **Preferences** | `notificationPreferences` |

### Media Storage: Garage S3

- Self-hosted S3-compatible object store
- Used for user-uploaded images (avatars, post images, event covers)
- Service: `src/lib/services/s3-service.ts`
- Static assets (mood covers, seed data): `/public/moods/`, `/public/seed/` (local SVGs)

---

## Authentication & Security

### Auth Flow

```
Signup → PoW CAPTCHA → WebAuthn Registration → JWT Session Cookie
Login  → WebAuthn Authentication → JWT Session Cookie
```

### Security Layers

| Layer | Implementation | File |
|---|---|---|
| **Route Protection** | `proxy.ts` — JWT verify, session refresh, CSRF injection | `src/proxy.ts` |
| **Write Guards** | `requireAuth()` — every write action (51 usages) | `src/lib/actions/shared.ts` |
| **Read Guards** | `getCurrentUserId()` — optional auth for reads | `src/lib/actions/shared.ts` |
| **CSRF** | Double-submit cookie pattern | `src/lib/auth/csrf.ts` |
| **Rate Limiting** | In-memory token bucket (RSVP, login) | `src/lib/auth/rate-limit.ts` |
| **Sessions** | DB-backed with revocation support | `src/lib/services/session-service.ts` |

### Session Architecture

- JWT stored in `HttpOnly` cookie (`tribes_session`)
- DB-backed session table enables:
  - Active session listing (`/settings`)
  - Remote session revocation
  - `currentSessionId` tracking for "current device" indicator

---

## Server Actions Architecture

All server actions use Next.js `'use server'` directives. They're organized into **7 domain modules** in `src/lib/actions/`:

```
Consumer (page.tsx) → Action Module → Service → Drizzle → SQLite
```

| Module | Responsibility | Key Functions |
|---|---|---|
| `shared.ts` | Auth guards, contribution tracking | `requireAuth`, `getCurrentUserId`, `trackContribution` |
| `auth-actions.ts` | Session management, tokens | `getActiveSessions`, `getWsToken`, `getCaptchaChallenge` |
| `tribe-actions.ts` | Tribe CRUD, membership | `createTribe`, `requestToJoinTribe`, `getMyTribes` |
| `bond-actions.ts` | Bond lifecycle, crypto | `sendBondRequest`, `submitBondPublicKey`, `blockUser` |
| `event-actions.ts` | Events, RSVP, streams | `createEvent`, `rsvpToEvent`, `getEventStreamPosts` |
| `content-actions.ts` | Posts, comments, search | `createTribePost`, `toggleVibe`, `searchAll`, `sendMessage` |
| `profile-actions.ts` | User, billing, vault | `getUserProfile`, `saveVaultBackup`, `createCheckoutSession` |

> **Import pattern**: All consumers use **direct imports** to domain modules (e.g., `import { createTribe } from '@/lib/actions/tribe-actions'`). The old `actions.ts` barrel file is deprecated.

---

## Component Architecture

### Decomposition Pattern

Large page components (>500 lines) are decomposed using a **Context + useReducer** pattern:

```typescript
// page.tsx — Thin Orchestrator (~40-130 lines)
async function Page() {
  const data = await fetchData();           // Server fetch
  return <Provider initialData={data}>      // Context provider
    <SubComponentA />
    <SubComponentB />
  </Provider>;
}

// *-context.tsx — State Management
const reducer = (state, action) => { ... }; // Centralized state
const Context = createContext(...);

// Sub-components: Read from context, dispatch actions
```

### Decomposed Pages

| Page | Orchestrator | Sub-components | Pattern |
|---|---|---|---|
| **Tribe Detail** | 38 lines | 7 co-located files | Context + useReducer |
| **Bonds** | 65 lines | 5 co-located files | Context + useReducer |
| **Your-Comms** | 128 lines | 5 co-located files | Context + useReducer |
| **Settings** | 423 lines | 6 section components | Direct extraction |

### Co-located Components

Sub-components live **alongside their parent page** (not in `/components/`). This makes the dependency graph obvious:

```
src/app/(app)/tribes/[tribeId]/
├── page.tsx                    # Orchestrator
├── tribe-detail-context.tsx    # Context + reducer
├── tribe-hero-banner.tsx       # Hero section
├── tribe-admin-dashboard.tsx   # Admin controls
├── tribe-feed-section.tsx      # Feed + posts
├── tribe-post-card.tsx         # Individual post
├── tribe-dialog-orchestrator.tsx # All dialogs
└── comment-card.tsx            # Comment display
```

### Shared Components

| Location | Purpose |
|---|---|
| `components/ui/` | shadcn/ui primitives (Button, Card, etc.) |
| `components/dialogs/` | ResponsiveDialog, SharePost, PromotePost, etc. |
| `components/layout/` | AppShell, Sidebar, TopBar |
| `components/settings/` | Settings page section components |
| `lib/bond-utils.tsx` | Shared bond display helpers |

---

## Feed Distribution

### Three Surfaces

1. **Tribe Feed** (`/tribes/[tribeId]`) — Members-only posts
2. **Mood Stream** (`/moods/[moodSlug]`) — Public discovery, posts promoted from tribes
3. **Intercom** (`/your-comms`) — Personalized aggregation of bonds + subscribed moods

### Promotion Flow

```
Tribe Post → Author/Speaker promotes → PromotePostDialog
           → Selects mood streams (limited to tribe's moods)
           → Creates post_mood_tags entries
           → Post appears in Mood Stream + subscribers' Intercom
```

### Bond Cryptographic Model

Bonds are **public-key pair relationships** with passkey rotation:
- 6 bond types (4 mutual, 2 asymmetric)
- Event bonds with access tiers (spectator/attendee/VIP)
- Identity layer: pseudonym, targetPseudonymForMe, tribeAssignedNickname
- Block/Ban model: query-level filtering across all content paths

---

## AI Integration

Built on Firebase Genkit with 6 flows:

| Flow | Purpose |
|---|---|
| `assistant-flow.ts` | T-Codex Prime AI assistant |
| `tribe-description-generator.ts` | Generate tribe descriptions from name + keywords |
| `event-description-generator.ts` | Generate event descriptions |
| `generate-event-keywords.ts` | Extract keywords from event text |
| `mood-based-content-suggestions.ts` | Suggest content for mood streams |
| `summarize-tribe-activity.ts` | Summarize recent tribe activity |

---

## Testing

### Test Suites (16 tests)

| Suite | Tests | File |
|---|---|---|
| Session | 4 | `src/lib/auth/__tests__/session.test.ts` |
| Server Actions | 6 | `src/lib/__tests__/actions.test.ts` |
| DRY Guards | 4 | Prevent re-introduction of eliminated patterns |
| Decomposition Guards | 2 | Ensure single-definition of extracted components |

### DRY Regression Guards

Tests that actively `grep` the codebase to prevent regression:
- No duplicate `timeSince` definitions
- No `placehold.co` URLs in service files
- No `(Simulated)` toast messages
- No duplicate `VIBE_EMOTICONS` definitions

---

## Dev Environment

### Prerequisites

- Node.js 20+
- LibSQL database (local file or Turso cloud)
- Garage S3 instance (for media uploads)

### Commands

```bash
npm run dev          # Start dev server (port 9002)
npm run build        # Production build
npx vitest run       # Run test suite
npx tsx src/db/seed.ts  # Seed database with sample data
```

### Environment Variables

```env
# Database
TURSO_DATABASE_URL=   # LibSQL/Turso URL
TURSO_AUTH_TOKEN=     # Turso auth token (optional for local)

# Auth
JWT_SECRET=           # JWT signing key
NEXT_PUBLIC_RP_ID=    # WebAuthn relying party ID
NEXT_PUBLIC_RP_NAME=  # WebAuthn relying party name

# Media
S3_ENDPOINT=          # Garage S3 endpoint
S3_ACCESS_KEY=        # S3 access key
S3_SECRET_KEY=        # S3 secret key
S3_BUCKET=            # S3 bucket name
S3_PUBLIC_URL=        # Public URL for uploaded media

# AI
GOOGLE_GENAI_API_KEY= # Google Genkit API key

# OAuth
GOOGLE_CLIENT_ID=     # Google OAuth client ID
GOOGLE_CLIENT_SECRET= # Google OAuth secret
```
