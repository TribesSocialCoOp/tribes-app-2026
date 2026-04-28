# ============================================================
# Tribes.app — Multi-Stage Production Build
# ============================================================
# Stage 1: Install dependencies (cached layer)
# Stage 2: Build Next.js (outputs .next/standalone)
# Stage 3: Minimal runtime (~150MB vs ~1GB full image)
# ============================================================

# --- Stage 1: deps ---
FROM node:22-alpine AS deps
WORKDIR /app

# Install only what's needed for native modules
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json* ./
RUN npm ci --frozen-lockfile --legacy-peer-deps

# --- Stage 2: builder ---
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build with standalone output (self-contained, no node_modules needed at runtime)
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# These env vars are read by next.config.ts at build time to produce
# correct CSP headers and image remotePatterns in the routes manifest.
ARG S3_PUBLIC_ENDPOINT=https://media.tribes.app
ARG S3_ENDPOINT=http://seaweedfs-filer:8333
ARG NEXT_PUBLIC_WS_RELAY_URL=wss://ws.tribes.app
ARG NEXT_PUBLIC_APP_URL=https://tribes.app
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY=BLJUvP0kGzxR5kB66PN799U2r5F1RW1ncFRgk_GT3ZQEFW4nS3XsAztPncGcreKBEVLJs8v7trEsNlImqlFVZGA
ENV S3_PUBLIC_ENDPOINT=${S3_PUBLIC_ENDPOINT}
ENV S3_ENDPOINT=${S3_ENDPOINT}
ENV NEXT_PUBLIC_WS_RELAY_URL=${NEXT_PUBLIC_WS_RELAY_URL}
ENV NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL}
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}

# Unset sync URL during build — sqld isn't reachable in the build stage,
# and the TCP timeout adds ~4 minutes of dead wait otherwise.
RUN TURSO_DATABASE_URL="" npm run build

# --- Stage 3: runner ---
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=9002
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Data directory for local SQLite replica
RUN mkdir -p /app/data && chown nextjs:nodejs /app/data
VOLUME ["/app/data"]

USER nextjs
EXPOSE 9002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD \
  wget -qO- http://127.0.0.1:9002/api/health || exit 1

CMD ["node", "server.js"]
