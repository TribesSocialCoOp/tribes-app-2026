"use client";

import React, { createContext, useContext, useReducer, useEffect, useMemo, useCallback } from 'react';
import { moodsData as allMoods } from '@/lib/moods-data';
import type { CommunicationItem, Ring } from '@/lib/types';
import { getUnifiedFeedAction } from '@/lib/actions/content-actions';
import { TribesWebSocket } from '@/lib/ws-client';

// ─── State ───────────────────────────────────────────────────────────────────

type RingFilterValue = Ring | 'all' | 'streams';

const RING_STORAGE_KEY = 'tribes_ring_filter';
const MOOD_STORAGE_KEY = 'tribes_mood_filter';

interface IntercomState {
  isLoading: boolean;
  feedItems: CommunicationItem[];
  ringFilter: RingFilterValue;
  selectedMoodSlugs: string[];
  hasLoadedFromStorage: boolean;
  editPostDialog: { open: boolean; target: CommunicationItem | null };
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_FEED_ITEMS'; payload: CommunicationItem[] }
  | { type: 'SET_RING_FILTER'; payload: RingFilterValue }
  | { type: 'SET_MOOD_SLUGS'; payload: string[] }
  | { type: 'TOGGLE_MOOD'; payload: { slug: string; checked: boolean } }
  | { type: 'SET_LOADED_FROM_STORAGE' }
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
  allMoods: typeof allMoods;
  refreshFeed: () => void;
  setRingFilter: (ring: RingFilterValue) => void;
  setMoodSlugs: (slugs: string[]) => void;
  handleOpenEditPostDialog: (item: CommunicationItem) => void;
}

const IntercomContext = createContext<IntercomContextValue | null>(null);

export function useIntercom() {
  const ctx = useContext(IntercomContext);
  if (!ctx) throw new Error('useIntercom must be used within IntercomProvider');
  return ctx;
}

// ─── Provider ────────────────────────────────────────────────────────────────

export function IntercomProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, {
    isLoading: true,
    feedItems: [],
    ringFilter: 'all',
    selectedMoodSlugs: [],
    hasLoadedFromStorage: false,
    editPostDialog: { open: false, target: null },
  });

  // Load filter state from localStorage
  useEffect(() => {
    const storedRing = localStorage.getItem(RING_STORAGE_KEY) as RingFilterValue | null;
    if (storedRing) {
      dispatch({ type: 'SET_RING_FILTER', payload: storedRing });
    }

    // One-time cleanup: Activity moved to /activity, tab persistence is gone
    localStorage.removeItem('tribes_intercom_tab');
    sessionStorage.removeItem('intercom_return_tab');

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
    }
  }, [state.ringFilter, state.selectedMoodSlugs, state.hasLoadedFromStorage]);

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

  // Subscribe to real-time WebSocket events and tab visibility changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const ws = TribesWebSocket.getInstance();

    const unsubscribeFeed = ws.subscribe('feed-update', () => {
      fetchFeed();
    });

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchFeed();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribeFeed();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchFeed]);

  const value = useMemo<IntercomContextValue>(() => ({
    state, dispatch, feedItems: state.feedItems, allMoods,
    refreshFeed, setRingFilter, setMoodSlugs,
    handleOpenEditPostDialog,
  }), [state, refreshFeed, setRingFilter, setMoodSlugs, handleOpenEditPostDialog]);

  return <IntercomContext.Provider value={value}>{children}</IntercomContext.Provider>;
}
