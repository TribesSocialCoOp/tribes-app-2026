/**
 * Tribes.app WebSocket Relay Server
 * 
 * Lightweight relay for E2E encrypted bond messaging.
 * - Authenticates connections via JWT (same secret as main app)
 * - Routes encrypted messages between bond partners
 * - Supports typing indicators and presence
 * 
 * Deployment: Co-located on cloud-sync VM alongside LibSQL + SeaweedFS
 * Dependencies: ws, jsonwebtoken (no framework, no HTTP server)
 */

const { WebSocketServer, WebSocket } = require('ws');
const jwt = require('jsonwebtoken');
const http = require('http');

// ============================================================
// CONFIG
// ============================================================

const PORT = parseInt(process.env.PORT || '9003', 10);
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET;

if (!JWT_SECRET) {
  console.error('[ws-relay] FATAL: JWT_SECRET or SESSION_SECRET must be set');
  process.exit(1);
}

// ============================================================
// STATE
// ============================================================

/** userId → Set<WebSocket> (one user can have multiple tabs) */
const connections = new Map();

/** bondId → Set<userId> for presence tracking */
const bondPresence = new Map();

/** IP → { count, resetAt } for connection rate limiting */
const connectionAttempts = new Map();
const MAX_CONNS_PER_IP = 10;
const CONN_WINDOW_MS = 60_000;

/** Valid message types (reject anything else) */
const VALID_MSG_TYPES = new Set(['message', 'typing', 'presence', 'read', 'feed-update', 'activity']);

// ============================================================
// SERVER
// ============================================================

const wss = new WebSocketServer({
  port: PORT,
  maxPayload: 64 * 1024, // 64KB max message size
});

console.log(`[ws-relay] Listening on ws://0.0.0.0:${PORT}`);

wss.on('connection', (ws, req) => {
  // --- RATE LIMIT: Per-IP connection throttling ---
  const clientIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.socket.remoteAddress
    || 'unknown';
  const now = Date.now();
  const attempt = connectionAttempts.get(clientIp);
  if (attempt && now < attempt.resetAt) {
    attempt.count++;
    if (attempt.count > MAX_CONNS_PER_IP) {
      ws.close(4029, 'Too many connections');
      return;
    }
  } else {
    connectionAttempts.set(clientIp, { count: 1, resetAt: now + CONN_WINDOW_MS });
  }

  // --- AUTH: Extract JWT from query string ---
  const url = new URL(req.url, `ws://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.close(4001, 'Missing auth token');
    return;
  }

  let userId;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    userId = payload.sub || payload.userId;
    if (!userId) throw new Error('No userId in token');
  } catch (err) {
    ws.close(4003, 'Invalid auth token');
    return;
  }

  // --- REGISTER CONNECTION ---
  if (!connections.has(userId)) {
    connections.set(userId, new Set());
  }
  connections.get(userId).add(ws);
  ws._userId = userId;

  console.log(`[ws-relay] Connected: ${userId} (${connections.get(userId).size} tabs)`);

  // --- HEARTBEAT ---
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  // --- MESSAGE ROUTING ---
  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());

      // Validate message type
      if (!msg.type || !VALID_MSG_TYPES.has(msg.type)) {
        return; // Silently drop unknown types
      }

      switch (msg.type) {
        case 'message': {
          // Route encrypted message to bond partner
          // msg: { type: 'message', bondId, targetUserId, ciphertext, messageId }
          const targetSockets = connections.get(msg.targetUserId);
          if (targetSockets) {
            const payload = JSON.stringify({
              type: 'message',
              bondId: msg.bondId,
              senderId: userId,
              ciphertext: msg.ciphertext,
              messageId: msg.messageId,
              sentAt: Date.now(),
            });
            for (const sock of targetSockets) {
              if (sock.readyState === WebSocket.OPEN) {
                sock.send(payload);
              }
            }
          }
          break;
        }

        case 'typing': {
          // Typing indicator: { type: 'typing', bondId, targetUserId, isTyping }
          const targetSockets = connections.get(msg.targetUserId);
          if (targetSockets) {
            const payload = JSON.stringify({
              type: 'typing',
              bondId: msg.bondId,
              userId,
              isTyping: msg.isTyping,
            });
            for (const sock of targetSockets) {
              if (sock.readyState === WebSocket.OPEN) {
                sock.send(payload);
              }
            }
          }
          break;
        }

        case 'presence': {
          // Join/leave a bond's presence channel
          // msg: { type: 'presence', bondId, action: 'join'|'leave' }
          const bondId = msg.bondId;
          if (!bondPresence.has(bondId)) bondPresence.set(bondId, new Set());
          
          if (msg.action === 'join') {
            bondPresence.get(bondId).add(userId);
          } else {
            bondPresence.get(bondId).delete(userId);
          }

          // Notify all in bond about presence change
          const members = bondPresence.get(bondId);
          const presencePayload = JSON.stringify({
            type: 'presence',
            bondId,
            members: Array.from(members),
          });
          for (const memberId of members) {
            const socks = connections.get(memberId);
            if (socks) {
              for (const sock of socks) {
                if (sock.readyState === WebSocket.OPEN) sock.send(presencePayload);
              }
            }
          }
          break;
        }

        case 'read': {
          // Read receipt: { type: 'read', bondId, targetUserId }
          const targetSockets = connections.get(msg.targetUserId);
          if (targetSockets) {
            const payload = JSON.stringify({
              type: 'read',
              bondId: msg.bondId,
              userId,
            });
            for (const sock of targetSockets) {
              if (sock.readyState === WebSocket.OPEN) sock.send(payload);
            }
          }
          break;
        }
      }
    } catch (err) {
      console.warn(`[ws-relay] Bad message from ${userId}:`, err.message);
    }
  });

  // --- DISCONNECT ---
  ws.on('close', () => {
    const userSockets = connections.get(userId);
    if (userSockets) {
      userSockets.delete(ws);
      if (userSockets.size === 0) {
        connections.delete(userId);
        // Clean presence
        for (const [bondId, members] of bondPresence) {
          members.delete(userId);
          if (members.size === 0) bondPresence.delete(bondId);
        }
      }
    }
    console.log(`[ws-relay] Disconnected: ${userId}`);
  });
});

// --- HEARTBEAT INTERVAL (30s) ---
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      console.log(`[ws-relay] Terminating stale connection: ${ws._userId}`);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

// --- GRACEFUL SHUTDOWN ---
process.on('SIGINT', () => {
  console.log('[ws-relay] Shutting down...');
  wss.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
  console.log('[ws-relay] Shutting down...');
  wss.close(() => process.exit(0));
});

// --- HEALTH CHECK SERVER & INTERNAL PUSH (HTTP 9004) ---
const INTERNAL_API_SECRET = process.env.INTERNAL_API_SECRET || 'tribes-internal-super-secret-123';

const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', connections: wss.clients.size }));
  } else if (req.url === '/internal/push' && req.method === 'POST') {
    if (req.headers['x-internal-secret'] !== INTERNAL_API_SECRET) {
      res.writeHead(403, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Forbidden' }));
      return;
    }

    let body = '';
    const MAX_BODY = 64 * 1024; // 64KB — same as WS maxPayload
    let oversized = false;
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > MAX_BODY) {
        oversized = true;
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (oversized) return;
      try {
        const { userId, payload } = JSON.parse(body);
        if (!userId || !payload) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing userId or payload' }));
          return;
        }

        const sockets = connections.get(userId);
        let deliveredCount = 0;
        if (sockets) {
          const msg = JSON.stringify(payload);
          for (const sock of sockets) {
            if (sock.readyState === WebSocket.OPEN) {
              sock.send(msg);
              deliveredCount++;
            }
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ delivered: deliveredCount }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

const HEALTH_PORT = process.env.HEALTH_PORT || '9004';
healthServer.listen(HEALTH_PORT, '0.0.0.0', () => {
  console.log(`[ws-relay] Health check & internal push listening on http://0.0.0.0:${HEALTH_PORT}`);
});

console.log(`[ws-relay] Ready. Awaiting connections.`);
