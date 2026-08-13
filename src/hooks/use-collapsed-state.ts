'use client';

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';

/**
 * Persists post/thread collapse state across reloads (issue #144).
 *
 * Per-device only (localStorage) — deliberately not synced to the DB/user
 * prefs. Only ids whose collapsed value differs from `defaultCollapsed` are
 * stored, and each kind's entry list is capped with simple LRU eviction so
 * the storage key can't grow unbounded.
 */

const STORAGE_KEY = 'tribes-collapsed-state';
const MAX_ENTRIES_PER_KIND = 500;

export type CollapsedStateKind = 'post-body' | 'comment' | 'comments-section';

type StoredState = Partial<Record<CollapsedStateKind, Record<string, boolean>>>;

// In-memory fallback used when localStorage is unavailable or throws
// (private browsing, native WebView edge cases, quota exceeded, etc).
let memoryFallback: StoredState = {};

let storageAvailable: boolean | null = null;

function isStorageAvailable(): boolean {
  if (storageAvailable !== null) return storageAvailable;
  if (typeof window === 'undefined') return false;
  try {
    const testKey = '__tribes_storage_test__';
    window.localStorage.setItem(testKey, '1');
    window.localStorage.removeItem(testKey);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }
  return storageAvailable;
}

function readStore(): StoredState {
  if (typeof window === 'undefined') return memoryFallback;
  if (!isStorageAvailable()) return memoryFallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as StoredState) : {};
  } catch {
    return memoryFallback;
  }
}

function writeStore(next: StoredState) {
  if (typeof window === 'undefined' || !isStorageAvailable()) {
    memoryFallback = next;
    return;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Quota exceeded or storage revoked mid-session — degrade gracefully.
    memoryFallback = next;
    storageAvailable = false;
  }
}

/**
 * Tracks collapsed/expanded state for a single post body, comment, or
 * comments-section, persisted to localStorage per-device.
 *
 * @param kind - namespace for the id (post body, comment, comments section)
 * @param id - the post/comment id being tracked
 * @param defaultCollapsed - initial value before any user interaction
 */
export function useCollapsedState(
  kind: CollapsedStateKind,
  id: string,
  defaultCollapsed = false,
): [boolean, Dispatch<SetStateAction<boolean>>] {
  // SSR-safe: always start from the default so server and first client
  // render match, then hydrate from localStorage after mount.
  const [collapsed, setCollapsedState] = useState(defaultCollapsed);

  useEffect(() => {
    const stored = readStore()[kind]?.[id];
    if (stored !== undefined) {
      setCollapsedState(stored);
    }
    // Only re-hydrate if the identity of what we're tracking changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, id]);

  const persist = useCallback(
    (value: boolean) => {
      const store = readStore();
      const kindEntries = { ...(store[kind] ?? {}) };

      // Don't store entries that match the default — keeps the key small.
      if (value === defaultCollapsed) {
        delete kindEntries[id];
      } else {
        // Delete + re-set moves the key to the end so insertion order
        // doubles as recency order for eviction below.
        delete kindEntries[id];
        kindEntries[id] = value;

        const keys = Object.keys(kindEntries);
        if (keys.length > MAX_ENTRIES_PER_KIND) {
          const overflow = keys.length - MAX_ENTRIES_PER_KIND;
          for (let i = 0; i < overflow; i++) {
            delete kindEntries[keys[i]];
          }
        }
      }

      writeStore({ ...store, [kind]: kindEntries });
    },
    [kind, id, defaultCollapsed],
  );

  const setCollapsed = useCallback<Dispatch<SetStateAction<boolean>>>(
    (value) => {
      setCollapsedState((prev) => {
        const next = typeof value === 'function' ? (value as (prev: boolean) => boolean)(prev) : value;
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return [collapsed, setCollapsed];
}
