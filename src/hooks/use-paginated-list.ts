'use client';

/**
 * @fileoverview Reusable hook for cursor-based "Load More" pagination.
 * Manages fetch state, item accumulation, and cursor tracking.
 *
 * Usage:
 *   const { items, isLoading, isLoadingMore, hasMore, loadMore, refresh } = usePaginatedList({
 *     fetchFn: (cursor, limit) => getPostsForTribe(tribeId, { cursor, limit }),
 *     limit: 20,
 *   });
 */

import { useState, useCallback, useRef } from 'react';
import type { PaginatedResult } from '@/lib/types';

export interface UsePaginatedListOptions<T> {
  /** Server action that returns a PaginatedResult. Called with cursor + limit. */
  fetchFn: (cursor: string | null, limit: number) => Promise<PaginatedResult<T>>;
  /** Items per page. Default 20. */
  limit?: number;
}

export interface UsePaginatedListReturn<T> {
  items: T[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  totalCount?: number;
  loadMore: () => Promise<void>;
  /** Re-fetches from the beginning, replacing all items. */
  refresh: () => Promise<void>;
  /** Prepend an item to the top of the list (e.g. new post via WebSocket). */
  prepend: (item: T) => void;
}

export function usePaginatedList<T>(
  options: UsePaginatedListOptions<T>,
): UsePaginatedListReturn<T> {
  const { fetchFn, limit = 20 } = options;

  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | undefined>(undefined);

  const cursorRef = useRef<string | null>(null);
  const initialLoadDone = useRef(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    cursorRef.current = null;
    try {
      const result = await fetchFn(null, limit);
      setItems(result.items);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
      if (result.totalCount !== undefined) setTotalCount(result.totalCount);
      initialLoadDone.current = true;
    } finally {
      setIsLoading(false);
    }
  }, [fetchFn, limit]);

  const loadMore = useCallback(async () => {
    if (!hasMore || isLoadingMore) return;
    setIsLoadingMore(true);
    try {
      const result = await fetchFn(cursorRef.current, limit);
      setItems(prev => [...prev, ...result.items]);
      cursorRef.current = result.nextCursor;
      setHasMore(result.nextCursor !== null);
      if (result.totalCount !== undefined) setTotalCount(result.totalCount);
    } finally {
      setIsLoadingMore(false);
    }
  }, [fetchFn, limit, hasMore, isLoadingMore]);

  const prepend = useCallback((item: T) => {
    setItems(prev => [item, ...prev]);
    setTotalCount(prev => (prev !== undefined ? prev + 1 : undefined));
  }, []);

  return { items, isLoading, isLoadingMore, hasMore, totalCount, loadMore, refresh, prepend };
}
