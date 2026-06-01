/**
 * @fileoverview Client-side WebSocket manager for Tribes.app.
 * Connects to the ws-relay, handles reconnection with exponential backoff,
 * and dispatches incoming messages to subscribers.
 *
 * Usage:
 * ```tsx
 * const ws = TribesWebSocket.getInstance();
 * ws.connect(jwtToken);
 * ws.subscribe('message', (data) => { ... });
 * ws.sendEncryptedMessage(bondId, targetUserId, ciphertextBase64);
 * ```
 */

type MessageHandler = (data: any) => void;
type WSMessageType = 'message' | 'typing' | 'presence' | 'read' | 'feed-update' | 'activity';

class TribesWebSocket {
  private static instance: TribesWebSocket | null = null;
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private subscribers = new Map<WSMessageType, Set<MessageHandler>>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isIntentionallyClosed = false;

  private constructor() {}

  static getInstance(): TribesWebSocket {
    if (!TribesWebSocket.instance) {
      TribesWebSocket.instance = new TribesWebSocket();
    }
    return TribesWebSocket.instance;
  }

  /**
   * Connect to the WebSocket relay with a JWT token.
   */
  connect(token: string): void {
    if (typeof window === 'undefined') return; // SSR guard

    const relayUrl = process.env.NEXT_PUBLIC_WS_RELAY_URL;
    if (!relayUrl) {
      console.warn('[ws-client] NEXT_PUBLIC_WS_RELAY_URL not set, WebSocket disabled');
      return;
    }

    this.token = token;
    this.isIntentionallyClosed = false;
    this.doConnect();
  }

  private doConnect(): void {
    if (!this.token) return;
    const relayUrl = process.env.NEXT_PUBLIC_WS_RELAY_URL;
    if (!relayUrl) return;

    try {
      this.ws = new WebSocket(`${relayUrl}?token=${this.token}`);

      this.ws.onopen = () => {
        console.log('[ws-client] Connected to relay');
        // Only reset attempts after connection is stable to ensure auth passed
        setTimeout(() => {
          if (this.ws?.readyState === WebSocket.OPEN) {
            this.reconnectAttempts = 0;
          }
        }, 5000);
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          const handlers = this.subscribers.get(data.type);
          if (handlers) {
            handlers.forEach(fn => fn(data));
          }
        } catch (err) {
          console.warn('[ws-client] Bad message:', err);
        }
      };

      this.ws.onclose = (event) => {
        if (this.isIntentionallyClosed) return;
        
        if (event.code === 4003) {
          console.error(`[ws-client] Auth rejected by relay (4003). JWT_SECRET mismatch?`);
          return; // Stop retrying on auth failure
        }

        console.log(`[ws-client] Disconnected (code: ${event.code}), reconnecting...`);
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[ws-client] WebSocket error');
      };
    } catch (err) {
      console.error('[ws-client] Failed to create WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[ws-client] Max reconnect attempts reached');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s cap
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`[ws-client] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => this.doConnect(), delay);
  }

  /**
   * Subscribe to a message type.
   */
  subscribe(type: WSMessageType, handler: MessageHandler): () => void {
    if (!this.subscribers.has(type)) {
      this.subscribers.set(type, new Set());
    }
    this.subscribers.get(type)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.subscribers.get(type)?.delete(handler);
    };
  }

  /**
   * Send an encrypted message to a bond partner.
   */
  sendEncryptedMessage(bondId: string, ciphertext: string, targetUserId?: string, messageId?: string): void {
    this.send({
      type: 'message',
      bondId,
      targetUserId,
      ciphertext,
      messageId,
    });
  }

  /**
   * Send typing indicator.
   */
  sendTyping(bondId: string, targetUserId?: string): void {
    this.send({
      type: 'typing',
      bondId,
      targetUserId,
      isTyping: true,
    });
  }

  /**
   * Join/leave presence for a bond (when opening/closing chat).
   */
  setPresence(bondId: string, action: 'join' | 'leave'): void {
    this.send({
      type: 'presence',
      bondId,
      action,
    });
  }

  /**
   * Send read receipt.
   */
  sendReadReceipt(bondId: string, targetUserId: string): void {
    this.send({
      type: 'read',
      bondId,
      targetUserId,
    });
  }

  private send(data: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /**
   * Disconnect intentionally (logout).
   */
  disconnect(): void {
    this.isIntentionallyClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.subscribers.clear();
  }

  /**
   * Whether the WebSocket is currently connected.
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

export { TribesWebSocket };
export type { WSMessageType };
