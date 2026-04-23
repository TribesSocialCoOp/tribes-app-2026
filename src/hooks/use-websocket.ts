'use client';

/**
 * @fileoverview Global WebSocket connection hook.
 * Connects to the ws-relay on mount, manages reconnection lifecycle,
 * and provides connection status. Used by WebSocketProvider in the app layout.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { TribesWebSocket } from '@/lib/ws-client';

export function useWebSocket() {
  const [connected, setConnected] = useState(false);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Don't connect if relay URL isn't configured
    const relayUrl = process.env.NEXT_PUBLIC_WS_RELAY_URL;
    if (!relayUrl) return;

    let cancelled = false;

    async function connect() {
      try {
        const { getWsToken } = await import('@/lib/actions/auth-actions');
        const token = await getWsToken();
        if (!token || cancelled) return;

        const ws = TribesWebSocket.getInstance();
        ws.connect(token);
        if (!cancelled) {
          setConnected(true);
          connectedRef.current = true;
        }
      } catch (err) {
        console.warn('[useWebSocket] Failed to connect:', err);
      }
    }

    connect();

    // Check connection state periodically (reconnection happens inside TribesWebSocket)
    const interval = setInterval(() => {
      const ws = TribesWebSocket.getInstance();
      const nowConnected = ws.isConnected;
      if (nowConnected !== connectedRef.current) {
        connectedRef.current = nowConnected;
        setConnected(nowConnected);
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      // Don't disconnect — singleton may be used by other components
    };
  }, []);

  const disconnect = useCallback(() => {
    TribesWebSocket.getInstance().disconnect();
    setConnected(false);
    connectedRef.current = false;
  }, []);

  return { connected, disconnect };
}
