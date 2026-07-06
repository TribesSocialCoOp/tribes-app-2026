"use client";

import React, { createContext, useContext, useReducer, useEffect, useMemo, useCallback } from 'react';
import { moodsData as allMoods } from '@/lib/moods-data';
import type { CommunicationItem, Ring } from '@/lib/types';
import type { ActivityItem } from '@/lib/services/notification-service';
import { getUnifiedFeedAction, getActivityFeed, markActivityViewed, markSingleActivityRead } from '@/lib/actions/content-actions';
import { useToast } from '@/hooks/use-toast';
import { TribesWebSocket } from '@/lib/ws-client';

// ─── State ───────────────────────────────────────────────────────────────────

type RingFilterValue = Ring | 'all' | 'streams';

const RING_STORAGE_KEY = 'tribes_ring_filter';
const MOOD_STORAGE_KEY = 'tribes_mood_filter';
const TAB_STORAGE_KEY = 'tribes_intercom_tab';
const RETURN_TAB_KEY = 'intercom_return_tab';

interface IntercomState {
  isLoading: boolean;
  feedItems: CommunicationItem[];
  ringFilter: RingFilterValue;
  selectedMoodSlugs: string[];
  hasLoadedFromStorage: boolean;
  activeTab: 'feed' | 'activity';
  activityItems: ActivityItem[];
  isLoadingActivity: boolean;
  editPostDialog: { open: boolean; target: CommunicationItem | null };
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_FEED_ITEMS'; payload: CommunicationItem[] }
  | { type: 'SET_RING_FILTER'; payload: RingFilterValue }
  | { type: 'SET_MOOD_SLUGS'; payload: string[] }
  | { type: 'TOGGLE_MOOD'; payload: { slug: string; checked: boolean } }
  | { type: 'SET_LOADED_FROM_STORAGE' }
  | { type: 'SET_ACTIVE_TAB'; payload: 'feed' | 'activity' }
  | { type: 'SET_ACTIVITY_ITEMS'; payload: ActivityItem[] }
  | { type: 'SET_LOADING_ACTIVITY'; payload: boolean }
  | { type: 'MARK_ALL_READ' }
  | { type: 'MARK_ITEM_READ'; payload: string }
  | { type: 'OPEN_EDIT_POST'; payload: CommunicationItem }
  | { type: 'CLOSE_EDIT_POST' };

function reducer(state: IntercomState, action: Action): IntercomState {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_FEED_ITEMS': return { ...state, feedItems: action.payload, isLoading: false };
    case 'SET_RING_FILTER': return { ...state, ringFilter: action.payload };
    case 'SET_MOOD_SLUGS': return { ...state, selectedMoodSlugs: action.payload };
    case 'TOGGLE_MOOD': return {
      ...state,
      selectedMoodSlugs: action.payload.checked
        ? [...state.selectedMoodSlugs, action.payload.slug]
        : state.selectedMoodSlugs.filter(s => s !== action.payload.slug),
    };
    case 'SET_LOADED_FROM_STORAGE': return { ...state, hasLoadedFromStorage: true };
    case 'SET_ACTIVE_TAB': return { ...state, activeTab: action.payload };
    case 'SET_ACTIVITY_ITEMS': return { ...state, activityItems: action.payload, isLoadingActivity: false };
    case 'SET_LOADING_ACTIVITY': return { ...state, isLoadingActivity: action.payload };
    case 'MARK_ALL_READ': return {
      ...state,
      activityItems: state.activityItems.map(item => ({ ...item, read: true })),
    };
    case 'MARK_ITEM_READ': return {
      ...state,
      activityItems: state.activityItems.map(item =>
        item.id === action.payload ? { ...item, read: true } : item
      ),
    };
    case 'OPEN_EDIT_POST': return { ...state, editPostDialog: { open: true, target: action.payload } };
    case 'CLOSE_EDIT_POST': return { ...state, editPostDialog: { open: false, target: null } };
    default: return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface IntercomContextValue {
  state: IntercomState;
  dispatch: React.Dispatch<Action>;
  feedItems: CommunicationItem[];
  activityCount: number;
  allMoods: typeof allMoods;
  refreshFeed: () => void;
  setRingFilter: (ring: RingFilterValue) => void;
  setMoodSlugs: (slugs: string[]) => void;
  handleOpenEditPostDialog: (item: CommunicationItem) => void;
  markAllRead: () => void;
  markItemRead: (itemId: string) => void;
}

const IntercomContext = createContext<IntercomContextValue | null>(null);

export function useIntercom() {
  const ctx = useContext(IntercomContext);
  if (!ctx) throw new Error('useIntercom must be used within IntercomProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function IntercomProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [state, dispatch] = useReducer(reducer, {
    isLoading: true,
    feedItems: [],
    ringFilter: 'all',
    selectedMoodSlugs: [],
    hasLoadedFromStorage: false,
    activeTab: 'feed',
    activityItems: [],
    isLoadingActivity: false,
    editPostDialog: { open: false, target: null },
  });

  // Load filter state from localStorage
  useEffect(() => {
    const storedRing = localStorage.getItem(RING_STORAGE_KEY) as RingFilterValue | null;
    if (storedRing) {
      dispatch({ type: 'SET_RING_FILTER', payload: storedRing });
    }

    // A "New Post" click lands here as ?compose=true. The composer (ComposeBox)
    // only mounts on the 'feed' sub-tab, so force that tab regardless of the
    // persisted/return tab — otherwise the compose intent is silently dropped
    // when the user last left the Feed page on the Activity tab. ComposeBox then
    // reads the param, expands, focuses, and strips it.
    const wantsCompose = new URLSearchParams(window.location.search).get('compose') === 'true';

    // sessionStorage takes priority — set by activity items before navigating away
    // so that back navigation always restores the correct tab
    const returnTab = sessionStorage.getItem(RETURN_TAB_KEY) as 'feed' | 'activity' | null;
    if (wantsCompose) {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: 'feed' });
      // Consume any return-tab hint so it can't override the compose intent.
      sessionStorage.removeItem(RETURN_TAB_KEY);
    } else if (returnTab) {
      dispatch({ type: 'SET_ACTIVE_TAB', payload: returnTab });
      sessionStorage.removeItem(RETURN_TAB_KEY);
    } else {
      const storedTab = localStorage.getItem(TAB_STORAGE_KEY) as 'feed' | 'activity' | null;
      if (storedTab) {
        dispatch({ type: 'SET_ACTIVE_TAB', payload: storedTab });
      }
    }

    try {
      const storedMoods = localStorage.getItem(MOOD_STORAGE_KEY);
      if (storedMoods) {
        const parsed = JSON.parse(storedMoods);
        if (Array.isArray(parsed)) {
          dispatch({ type: 'SET_MOOD_SLUGS', payload: parsed });
        }
      }
    } catch { /* ignore */ }

    dispatch({ type: 'SET_LOADED_FROM_STORAGE' });
  }, []);

  // Persist filter state
  useEffect(() => {
    if (state.hasLoadedFromStorage) {
      localStorage.setItem(RING_STORAGE_KEY, state.ringFilter);
      localStorage.setItem(MOOD_STORAGE_KEY, JSON.stringify(state.selectedMoodSlugs));
      localStorage.setItem(TAB_STORAGE_KEY, state.activeTab);
    }
  }, [state.ringFilter, state.selectedMoodSlugs, state.activeTab, state.hasLoadedFromStorage]);

  // Fetch unified feed when filters change
  const fetchFeed = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const items = await getUnifiedFeedAction(
        state.ringFilter,
        state.selectedMoodSlugs.length > 0 ? state.selectedMoodSlugs : undefined,
        50,
        0,
      );
      dispatch({ type: 'SET_FEED_ITEMS', payload: items });
    } catch {
      dispatch({ type: 'SET_FEED_ITEMS', payload: [] });
    }
  }, [state.ringFilter, state.selectedMoodSlugs]);

  useEffect(() => {
    if (state.hasLoadedFromStorage) {
      fetchFeed();
    }
  }, [state.hasLoadedFromStorage, fetchFeed]);

  // Ring filter setter
  const setRingFilter = useCallback((ring: RingFilterValue) => {
    dispatch({ type: 'SET_RING_FILTER', payload: ring });
  }, []);

  // Mood filter setter
  const setMoodSlugs = useCallback((slugs: string[]) => {
    dispatch({ type: 'SET_MOOD_SLUGS', payload: slugs });
  }, []);

  // External refresh trigger (e.g. ComposeBox after posting)
  const refreshFeed = useCallback(() => {
    fetchFeed();
  }, [fetchFeed]);

  const handleOpenEditPostDialog = useCallback((item: CommunicationItem) => {
    dispatch({ type: 'OPEN_EDIT_POST', payload: item });
  }, []);

  // ── Activity feed: eager load on mount + refresh on tab switch ──
  const prevActivityCountRef = React.useRef(0);

  const fetchActivity = useCallback(async () => {
    dispatch({ type: 'SET_LOADING_ACTIVITY', payload: true });
    try {
      const items = await getActivityFeed();
      dispatch({ type: 'SET_ACTIVITY_ITEMS', payload: items });

      // Fire local notification for new unread activity
      const unreadCount = items.filter((a: ActivityItem) => !a.read).length;
      if (unreadCount > prevActivityCountRef.current && prevActivityCountRef.current > 0) {
        const newest = items.find((a: ActivityItem) => !a.read);
        if (newest) {
          toast({
            title: 'New Activity',
            description: newest.description || 'You have new activity on Tribes.app',
          });
        }
      }
      prevActivityCountRef.current = unreadCount;
    } catch {
      // silent
    } finally {
      dispatch({ type: 'SET_LOADING_ACTIVITY', payload: false });
    }
  }, []);

  // Eager load activity on mount (so badge count is accurate before tab click)
  useEffect(() => {
    fetchActivity();
  }, [fetchActivity]);

  // Refresh activity data when switching to the activity tab
  useEffect(() => {
    if (state.activeTab === 'activity') {
      fetchActivity();
    }
  }, [state.activeTab, fetchActivity]);

  // Subscribe to real-time WebSocket events and tab visibility changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ws = TribesWebSocket.getInstance();
    
    const unsubscribeFeed = ws.subscribe('feed-update', () => {
      fetchFeed();
    });
    
    const unsubscribeActivity = ws.subscribe('activity', () => {
      fetchActivity();
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchFeed();
        fetchActivity();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeFeed();
      unsubscribeActivity();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchFeed, fetchActivity]);

  // Mark all read: update client state immediately + persist to server + refetch
  const markAllRead = useCallback(async () => {
    dispatch({ type: 'MARK_ALL_READ' });
    // Notify sidebar badge immediately
    window.dispatchEvent(new CustomEvent('activity-read-change', { detail: { unreadCount: 0 } }));
    try {
      await markActivityViewed();
      // Refetch so server-derived read state is in sync
      const items = await getActivityFeed();
      dispatch({ type: 'SET_ACTIVITY_ITEMS', payload: items });
      const newCount = items.filter((a: ActivityItem) => !a.read).length;
      prevActivityCountRef.current = newCount;
      // Re-sync sidebar in case server count differs
      window.dispatchEvent(new CustomEvent('activity-read-change', { detail: { unreadCount: newCount } }));
    } catch {
      // Client state is already updated, server will catch up
    }
  }, []);

  // Mark a single item as read: update client state + persist to server
  const markItemRead = useCallback((itemId: string) => {
    dispatch({ type: 'MARK_ITEM_READ', payload: itemId });
    
    // Compute new unread count and notify sidebar badge
    const newUnread = state.activityItems.filter(
      (a: ActivityItem) => !a.read && a.id !== itemId
    ).length;
    window.dispatchEvent(new CustomEvent('activity-read-change', { detail: { unreadCount: newUnread } }));
    
    // Fire-and-forget server sync
    markSingleActivityRead(itemId).catch(() => {});
  }, [state.activityItems]);

  // Derived data
  const activityCount = useMemo(() =>
    state.activityItems.filter((a: ActivityItem) => !a.read).length, [state.activityItems]);

  const value = useMemo<IntercomContextValue>(() => ({
    state, dispatch, feedItems: state.feedItems, activityCount, allMoods,
    refreshFeed, setRingFilter, setMoodSlugs,
    handleOpenEditPostDialog, markAllRead, markItemRead,
  }), [state, activityCount, refreshFeed, setRingFilter, setMoodSlugs, handleOpenEditPostDialog, markAllRead, markItemRead]);

  return <IntercomContext.Provider value={value}>{children}</IntercomContext.Provider>;
}
