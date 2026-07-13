"use client";

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type { ActivityItem } from '@/lib/services/notification-service';
import { getActivityFeed, markActivityViewed, markSingleActivityRead } from '@/lib/actions/content-actions';
import { useToast } from '@/hooks/use-toast';
import { useUser } from '@/hooks/use-user';
import { TribesWebSocket } from '@/lib/ws-client';

interface ActivityContextValue {
  items: ActivityItem[];
  isLoading: boolean;
  unreadCount: number;
  fetchActivity: () => void;
  markAllRead: () => void;
  markItemRead: (itemId: string) => void;
}

const ActivityContext = createContext<ActivityContextValue | null>(null);

export function useActivity() {
  const ctx = useContext(ActivityContext);
  if (!ctx) throw new Error('useActivity must be used within ActivityProvider');
  return ctx;
}

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const { role } = useUser();
  const isGuest = !role;

  const [items, setItems] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const prevUnreadCountRef = useRef(0);
  const inFlightRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchActivity = useCallback(async () => {
    if (isGuest) return;
    // Skip if a fetch is already in flight — prevents a slow earlier response
    // from clobbering a newer one, and collapses redundant refreshes
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsLoading(true);
    try {
      const fetched = await getActivityFeed();
      setItems(fetched);

      // Fire local notification for new unread activity
      const unread = fetched.filter((a: ActivityItem) => !a.read).length;
      if (unread > prevUnreadCountRef.current && prevUnreadCountRef.current > 0) {
        const newest = fetched.find((a: ActivityItem) => !a.read);
        if (newest) {
          toast({
            title: 'New Activity',
            description: newest.description || 'You have new activity on Tribes.app',
          });
        }
      }
      prevUnreadCountRef.current = unread;
    } catch {
      // silent
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  }, [isGuest, toast]);

  // Debounced variant for WebSocket-driven refreshes: getActivityFeed() is an
  // expensive multi-query aggregation and every incoming chat message fires a
  // 'message' event to every online recipient — a burst of messages must
  // collapse into a single trailing fetch, not one fetch per message.
  const fetchActivityDebounced = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      fetchActivity();
    }, 4000);
  }, [fetchActivity]);

  // Initial load + WS refresh + focus reconciliation
  useEffect(() => {
    if (isGuest || typeof window === 'undefined') return;

    fetchActivity();

    const ws = TribesWebSocket.getInstance();
    const unsubscribeActivity = ws.subscribe('activity', () => fetchActivityDebounced());
    // Incoming chat messages also surface as activity (unread_message items)
    const unsubscribeMessage = ws.subscribe('message', () => fetchActivityDebounced());

    // User is actively looking — fetch immediately, not debounced
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchActivity();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeActivity();
      unsubscribeMessage();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [isGuest, fetchActivity, fetchActivityDebounced]);

  // Mark all read: update client state immediately + persist to server + refetch
  const markAllRead = useCallback(async () => {
    setItems(prev => prev.map(item => ({ ...item, read: true })));
    prevUnreadCountRef.current = 0;
    try {
      await markActivityViewed();
      // Refetch so server-derived read state is in sync
      const fetched = await getActivityFeed();
      setItems(fetched);
      prevUnreadCountRef.current = fetched.filter((a: ActivityItem) => !a.read).length;
    } catch {
      // Client state is already updated, server will catch up
    }
  }, []);

  // Mark a single item as read: update client state + persist to server
  const markItemRead = useCallback((itemId: string) => {
    setItems(prev => prev.map(item => (item.id === itemId ? { ...item, read: true } : item)));
    prevUnreadCountRef.current = Math.max(0, prevUnreadCountRef.current - 1);
    // Fire-and-forget server sync
    markSingleActivityRead(itemId).catch(() => {});
  }, []);

  const unreadCount = useMemo(() => items.filter((a: ActivityItem) => !a.read).length, [items]);

  const value = useMemo<ActivityContextValue>(() => ({
    items, isLoading, unreadCount, fetchActivity, markAllRead, markItemRead,
  }), [items, isLoading, unreadCount, fetchActivity, markAllRead, markItemRead]);

  return <ActivityContext.Provider value={value}>{children}</ActivityContext.Provider>;
}
