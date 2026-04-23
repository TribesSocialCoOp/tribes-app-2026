'use client';

/**
 * @fileoverview WebSocket context provider.
 * Wraps the app layout to establish a single, persistent WS connection
 * and share connection status with child components.
 */

import React, { createContext, useContext } from 'react';
import { useWebSocket } from '@/hooks/use-websocket';
import { useUser } from '@/hooks/use-user';

interface WebSocketContextValue {
  connected: boolean;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextValue>({
  connected: false,
  disconnect: () => {},
});

export function useWebSocketContext() {
  return useContext(WebSocketContext);
}

export function WebSocketProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  
  // Only connect if user is authenticated
  const shouldConnect = !!user?.id;

  if (!shouldConnect) {
    return (
      <WebSocketContext.Provider value={{ connected: false, disconnect: () => {} }}>
        {children}
      </WebSocketContext.Provider>
    );
  }

  return <ConnectedProvider>{children}</ConnectedProvider>;
}

/**
 * Inner component that actually activates the WS hook.
 * Separated to avoid calling the hook when user isn't authenticated.
 */
function ConnectedProvider({ children }: { children: React.ReactNode }) {
  const { connected, disconnect } = useWebSocket();

  return (
    <WebSocketContext.Provider value={{ connected, disconnect }}>
      {children}
    </WebSocketContext.Provider>
  );
}
