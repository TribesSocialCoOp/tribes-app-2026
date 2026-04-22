"use client";

import React, { createContext, useContext, useReducer, useEffect, useMemo, useCallback } from 'react';
import { moodsData as allMoods } from '@/lib/moods-data';
import type { MoodStreamPost, Bond, CommunicationItem, DiscussionComment } from '@/lib/types';
import type { ActivityItem } from '@/lib/services/notification-service';
import { getBonds } from '@/lib/actions/bond-actions';
import { getMoodStreamPosts, toggleVibe, createComment, getCommentsForPost, getActivityFeed, getLatestMessagePreview } from '@/lib/actions/content-actions';
import { useToast } from '@/hooks/use-toast';
import { showLocalNotification } from '@/hooks/use-push-notifications';

// ─── State ───────────────────────────────────────────────────────────────────

const DEFAULT_SELECTED_MOODS = ['chill', 'focus', 'showcase', 'discover'];
const LOCAL_STORAGE_KEY = 'tribesAppSelectedMoods';

interface IntercomState {
  isLoading: boolean;
  allCommsData: CommunicationItem[];
  selectedMoodSlugs: string[];
  isTunerOpen: boolean;
  hasLoadedFromStorage: boolean;
  activeTab: 'feed' | 'activity';
  activityItems: ActivityItem[];
  isLoadingActivity: boolean;
}

type Action =
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_COMMS_DATA'; payload: CommunicationItem[] }
  | { type: 'SET_MOOD_SLUGS'; payload: string[] }
  | { type: 'TOGGLE_MOOD'; payload: { slug: string; checked: boolean } }
  | { type: 'SET_TUNER_OPEN'; payload: boolean }
  | { type: 'SET_LOADED_FROM_STORAGE' }
  | { type: 'SET_ACTIVE_TAB'; payload: 'feed' | 'activity' }
  | { type: 'SET_ACTIVITY_ITEMS'; payload: ActivityItem[] }
  | { type: 'SET_LOADING_ACTIVITY'; payload: boolean };

function reducer(state: IntercomState, action: Action): IntercomState {
  switch (action.type) {
    case 'SET_LOADING': return { ...state, isLoading: action.payload };
    case 'SET_COMMS_DATA': return { ...state, allCommsData: action.payload, isLoading: false };
    case 'SET_MOOD_SLUGS': return { ...state, selectedMoodSlugs: action.payload };
    case 'TOGGLE_MOOD': return {
      ...state,
      selectedMoodSlugs: action.payload.checked
        ? [...state.selectedMoodSlugs, action.payload.slug]
        : state.selectedMoodSlugs.filter(s => s !== action.payload.slug),
    };
    case 'SET_TUNER_OPEN': return { ...state, isTunerOpen: action.payload };
    case 'SET_LOADED_FROM_STORAGE': return { ...state, hasLoadedFromStorage: true };
    case 'SET_ACTIVE_TAB': return { ...state, activeTab: action.payload };
    case 'SET_ACTIVITY_ITEMS': return { ...state, activityItems: action.payload, isLoadingActivity: false };
    case 'SET_LOADING_ACTIVITY': return { ...state, isLoadingActivity: action.payload };
    default: return state;
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface IntercomContextValue {
  state: IntercomState;
  dispatch: React.Dispatch<Action>;
  familyComms: CommunicationItem[];
  regularComms: CommunicationItem[];
  highlightsFromYourMoods: CommunicationItem[];
  activityCount: number;
  allMoods: typeof allMoods;
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
    allCommsData: [],
    selectedMoodSlugs: [],
    isTunerOpen: false,
    hasLoadedFromStorage: false,
    activeTab: 'feed',
    activityItems: [],
    isLoadingActivity: false,
  });

  // Load filter state from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.every(s => typeof s === 'string')) {
          dispatch({ type: 'SET_MOOD_SLUGS', payload: parsed });
        } else {
          dispatch({ type: 'SET_MOOD_SLUGS', payload: DEFAULT_SELECTED_MOODS });
        }
      } catch {
        dispatch({ type: 'SET_MOOD_SLUGS', payload: DEFAULT_SELECTED_MOODS });
      }
    } else {
      dispatch({ type: 'SET_MOOD_SLUGS', payload: DEFAULT_SELECTED_MOODS });
    }
    dispatch({ type: 'SET_LOADED_FROM_STORAGE' });
  }, []);

  // Persist filter state
  useEffect(() => {
    if (state.hasLoadedFromStorage) {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.selectedMoodSlugs));
    }
  }, [state.selectedMoodSlugs, state.hasLoadedFromStorage]);

  // Fetch all feed data
  useEffect(() => {
    const fetchAllData = async () => {
      const [bonds, moodPosts] = await Promise.all([getBonds(), getMoodStreamPosts()]);

      // Build bond message items from real DB data
      const bondMessages: CommunicationItem[] = [];
      for (const b of bonds.filter(b => b.bondType === 'family' || b.bondType === 'friend')) {
        const latestMsg = await getLatestMessagePreview(b.id);
        const initials = b.targetName.split(" ").map(n => n[0]).join('').substring(0, 2).toUpperCase();
        bondMessages.push({
          id: `bond-msg-${b.id}`,
          type: b.bondType === 'family' ? 'family-bond' : 'regular-bond',
          sender: b.targetName,
          bondName: b.targetName,
          message: latestMsg?.preview || 'Start a conversation!',
          vibes: 0,
          timestamp: latestMsg?.sentAt ?? b.lastRefreshedAt,
          avatarFallback: initials,
        } as CommunicationItem);
      }
      const moodStreamItems: CommunicationItem[] = moodPosts.map(post => {
        const primaryMoodSlug = post.moodTags[0];
        const moodDetails = allMoods.find(m => m.slug === primaryMoodSlug);
        return {
          id: post.id,
          type: "mood-stream",
          tribeName: post.tribeName,
          tribeId: post.tribeId,
          content: post.content,
          title: post.title,
          moodSlug: primaryMoodSlug,
          moodName: moodDetails?.name || primaryMoodSlug,
          avatarSrc: post.authorAvatarSrc,
          avatarFallback: post.authorAvatarFallback || post.author?.substring(0, 2),
          timestamp: post.timestamp,
          vibes: post.vibes,
          dataAiHint: post.dataAiHintAvatar,
          imageUrl: post.imageUrl,
          imageAlt: post.imageAlt,
          dataAiHintImage: post.dataAiHintImage,
          sender: post.author,
          promotedByName: post.promotedByName,
        } as CommunicationItem;
      });
      const combined = [...bondMessages, ...moodStreamItems].sort(
        (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
      );
      dispatch({ type: 'SET_COMMS_DATA', payload: combined });
    };
    fetchAllData();
  }, []);

  // Load activity feed when tab switches + fire local notifications for new items
  const prevActivityCountRef = React.useRef(0);
  useEffect(() => {
    if (state.activeTab !== 'activity') return;
    let cancelled = false;
    dispatch({ type: 'SET_LOADING_ACTIVITY', payload: true });
    getActivityFeed()
      .then(items => {
        if (cancelled) return;
        dispatch({ type: 'SET_ACTIVITY_ITEMS', payload: items });

        // Fire local notification for new unread activity
        const unreadCount = items.filter((a: ActivityItem) => !a.read).length;
        if (unreadCount > prevActivityCountRef.current && prevActivityCountRef.current > 0) {
          const newest = items.find((a: ActivityItem) => !a.read);
          if (newest) {
            showLocalNotification(
              'New Activity',
              newest.description || 'You have new activity on Tribes.app',
              '/your-comms'
            );
          }
        }
        prevActivityCountRef.current = unreadCount;
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) dispatch({ type: 'SET_LOADING_ACTIVITY', payload: false }); });
    return () => { cancelled = true; };
  }, [state.activeTab]);

  // Derived data
  const familyComms = useMemo(() =>
    state.allCommsData.filter(c => c.type === 'family-bond'), [state.allCommsData]);
  const regularComms = useMemo(() =>
    state.allCommsData.filter(c => c.type === 'regular-bond'), [state.allCommsData]);
  const highlightsFromYourMoods = useMemo(() => {
    if (state.selectedMoodSlugs.length === 0 && state.hasLoadedFromStorage) return [];
    const slugs = state.selectedMoodSlugs.length > 0
      ? state.selectedMoodSlugs
      : (state.hasLoadedFromStorage ? [] : DEFAULT_SELECTED_MOODS);
    return state.allCommsData
      .filter(c => c.type === 'mood-stream' && c.moodSlug && slugs.includes(c.moodSlug))
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 5);
  }, [state.selectedMoodSlugs, state.hasLoadedFromStorage, state.allCommsData]);
  const activityCount = useMemo(() =>
    state.activityItems.filter((a: ActivityItem) => !a.read).length, [state.activityItems]);

  const value = useMemo<IntercomContextValue>(() => ({
    state, dispatch, familyComms, regularComms, highlightsFromYourMoods, activityCount, allMoods,
  }), [state, familyComms, regularComms, highlightsFromYourMoods, activityCount]);

  return <IntercomContext.Provider value={value}>{children}</IntercomContext.Provider>;
}
