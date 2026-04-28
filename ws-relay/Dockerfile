# ============================================================
# Tribes.app WebSocket Relay — Production Container
# ============================================================

FROM node:22-alpine
WORKDIR /app

# Install only production dependencies
COPY package.json ./
RUN npm install --production --frozen-lockfile 2>/dev/null || npm install --production

COPY server.js .

RUN addgroup --system --gid 1001 wsrelay \
 && adduser --system --uid 1001 wsrelay \
 && chown -R wsrelay:wsrelay /app

USER wsrelay

EXPOSE 9003

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:9004/health || exit 1

CMD ["node", "server.js"]
