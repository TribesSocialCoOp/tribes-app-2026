"use client";

/**
 * @fileoverview Message search hook with IndexedDB cache.
 * Decrypts message batches client-side and caches them for future searches.
 * Plaintext never leaves the browser.
 */

import { useState, useCallback, useRef } from 'react';

// ─── IndexedDB Cache ─────────────────────────────────────────────────────────

const DB_NAME = 'tribes_message_cache';
const DB_VERSION = 1;
const STORE_NAME = 'messages';

interface CachedMessage {
  id: string;
  bondId: string;
  senderId: string;
  plaintext: string;
  sentAt: Date;
}

function openCacheDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('bondId', 'bondId', { unique: false });
        store.createIndex('sentAt', 'sentAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getCachedMessages(bondId: string): Promise<CachedMessage[]> {
  try {
    const db = await openCacheDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const index = store.index('bondId');
      const request = index.getAll(bondId);
      request.onsuccess = () => resolve(request.result ?? []);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return [];
  }
}

async function cacheMessages(messages: CachedMessage[]): Promise<void> {
  try {
    const db = await openCacheDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const msg of messages) {
      store.put(msg);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Silently fail — cache is best-effort
  }
}

// ─── Date Range Presets ──────────────────────────────────────────────────────

export type DateRangePreset = '7d' | '30d' | '90d' | 'all';

function getDateRangeStart(preset: DateRangePreset): Date {
  const now = new Date();
  switch (preset) {
    case '7d': return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '30d': return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case '90d': return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'all': return new Date(0); // epoch
  }
}

// ─── Search Result Types ─────────────────────────────────────────────────────

export interface SearchResult {
  id: string;
  senderId: string;
  plaintext: string;
  sentAt: Date;
  matchIndex: number; // character index of match start
}

// ─── Hook ────────────────────────────────────────────────────────────────────

interface UseMessageSearchOptions {
  bondId: string;
  sharedSecret: CryptoKey | null;
  loadedMessages: Array<{ id: string; senderId: string; plaintext: string; sentAt: Date }>;
}

export function useMessageSearch({ bondId, sharedSecret, loadedMessages }: UseMessageSearchOptions) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSearching, setIsSearching] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangePreset>('30d');
  const [searchedRange, setSearchedRange] = useState<DateRangePreset | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(async (searchQuery: string, range: DateRangePreset = dateRange) => {
    if (!searchQuery.trim()) {
      setResults([]);
      setCurrentIndex(0);
      return;
    }

    setIsSearching(true);
    const normalizedQuery = searchQuery.toLowerCase().trim();

    // Cancel previous search
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      // Step 1: Search loaded messages first (fast path)
      let allDecrypted = [...loadedMessages];

      // Step 2: Check IndexedDB cache for additional messages
      const cached = await getCachedMessages(bondId);
      const cachedIds = new Set(cached.map(m => m.id));
      const loadedIds = new Set(loadedMessages.map(m => m.id));

      // Merge cached messages not already loaded
      for (const msg of cached) {
        if (!loadedIds.has(msg.id)) {
          allDecrypted.push(msg);
        }
      }

      // Step 3: If user asked for a wider range, fetch + decrypt from server
      if (range !== searchedRange && sharedSecret) {
        try {
          const { getMessagesByDateRange } = await import('@/lib/actions/content-actions');
          const startDate = getDateRangeStart(range);
          const rawMessages = await getMessagesByDateRange(bondId, startDate, new Date(), 500);

          if (controller.signal.aborted) return;

          // Decrypt new messages
          const { decrypt } = await import('@/lib/crypto');
          const newDecrypted: CachedMessage[] = [];

          for (const msg of rawMessages) {
            if (loadedIds.has(msg.id) || cachedIds.has(msg.id)) continue;
            try {
              if (msg.ciphertext) {
                const ciphertextBuffer = Uint8Array.from(
                  Buffer.from(msg.ciphertext as unknown as string, 'base64')
                ).buffer;
                const plaintextBuffer = await decrypt(sharedSecret, ciphertextBuffer);
                const plaintext = new TextDecoder().decode(plaintextBuffer);
                const decrypted: CachedMessage = {
                  id: msg.id,
                  bondId,
                  senderId: msg.senderId,
                  plaintext,
                  sentAt: msg.sentAt ?? new Date(),
                };
                newDecrypted.push(decrypted);
                allDecrypted.push(decrypted);
              }
            } catch {
              // Skip messages that fail to decrypt
            }
          }

          // Cache newly decrypted messages
          if (newDecrypted.length > 0) {
            await cacheMessages(newDecrypted);
          }

          setSearchedRange(range);
        } catch (err) {
          console.error('[search] Failed to fetch range:', err);
        }
      }

      if (controller.signal.aborted) return;

      // Step 4: Filter by query
      const matchedResults: SearchResult[] = [];
      for (const msg of allDecrypted) {
        const idx = msg.plaintext.toLowerCase().indexOf(normalizedQuery);
        if (idx !== -1) {
          matchedResults.push({
            id: msg.id,
            senderId: msg.senderId,
            plaintext: msg.plaintext,
            sentAt: msg.sentAt,
            matchIndex: idx,
          });
        }
      }

      // Sort newest first
      matchedResults.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      setResults(matchedResults);
      setCurrentIndex(0);
    } finally {
      setIsSearching(false);
    }
  }, [bondId, sharedSecret, loadedMessages, dateRange, searchedRange]);

  const navigateResult = useCallback((direction: 'next' | 'prev') => {
    if (results.length === 0) return;
    if (direction === 'next') {
      setCurrentIndex(prev => (prev + 1) % results.length);
    } else {
      setCurrentIndex(prev => (prev - 1 + results.length) % results.length);
    }
  }, [results.length]);

  const clearSearch = useCallback(() => {
    setQuery('');
    setResults([]);
    setCurrentIndex(0);
    setIsOpen(false);
  }, []);

  return {
    query,
    setQuery,
    results,
    currentIndex,
    currentResult: results[currentIndex] ?? null,
    isSearching,
    isOpen,
    setIsOpen,
    dateRange,
    setDateRange,
    search,
    navigateResult,
    clearSearch,
    totalResults: results.length,
  };
}
