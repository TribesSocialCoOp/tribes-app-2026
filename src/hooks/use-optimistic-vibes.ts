"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import { toggleVibe } from '@/lib/actions/content-actions';
import { triggerHaptic } from '@/lib/capacitor/haptics';
import { ImpactStyle } from '@capacitor/haptics';
import type { VibeDetail } from '@/lib/types';

export type { VibeDetail };

/**
 * Configuration for the useOptimisticVibes hook.
 */
interface UseOptimisticVibesConfig {
  /** The content ID (post or comment) */
  targetId: string;
  /** Whether this is a post or comment */
  targetType: 'post' | 'comment';
  /** Server-provided vibe count */
  serverVibeCount: number;
  /** Server-provided recent vibes */
  serverRecentVibes: { emoji: string; count: number }[];
  /** Server-provided vibe details (only when viewer can see reactors) */
  serverVibeDetails: VibeDetail[];
  /** Whether the current user has already vibed */
  serverHasVibed: boolean;
  /** The user's currently selected emoji. Null if no vibe. */
  serverSelectedVibe: string | null;
  /** Whether the current user can see reactor details (author, post author, etc.) */
  canSeeReactors: boolean;
  /** Current user ID — must be truthy for optimistic updates */
  currentUserId: string | undefined | null;
  /** Current user display name */
  currentUserName: string | undefined;
}

/**
 * Consolidated hook for optimistic vibe (reaction) state across all card types.
 *
 * Eliminates the duplicated ~60-line pattern that was copy-pasted in 6 components.
 * Handles optimistic updates, server reconciliation, and rollback on error.
 */
export function useOptimisticVibes(config: UseOptimisticVibesConfig) {
  const {
    targetId,
    targetType,
    serverVibeCount,
    serverRecentVibes,
    serverVibeDetails,
    serverHasVibed,
    serverSelectedVibe,
    canSeeReactors,
    currentUserId,
    currentUserName,
  } = config;

  // ── Local state overrides (null = use server value) ──
  const [localVibeCount, setLocalVibeCount] = useState<number | null>(null);
  const [localRecentVibes, setLocalRecentVibes] = useState<{ emoji: string; count: number }[] | null>(null);
  const [localVibeDetails, setLocalVibeDetails] = useState<VibeDetail[] | null>(null);
  const [localHasVibed, setLocalHasVibed] = useState<boolean | null>(null);
  const [localSelectedVibe, setLocalSelectedVibe] = useState<string | null | undefined>(undefined);

  // ── Derived current values ──
  const vibeCount = localVibeCount !== null ? localVibeCount : serverVibeCount;
  const recentVibes = localRecentVibes !== null ? localRecentVibes : serverRecentVibes;
  const vibeDetails = localVibeDetails !== null ? localVibeDetails : serverVibeDetails;
  const hasVibed = localHasVibed !== null ? localHasVibed : serverHasVibed;
  const selectedVibe = localSelectedVibe !== undefined ? localSelectedVibe : serverSelectedVibe;


  // ── Debounce guard ──
  const isVibingRef = useRef(false);

  // Reset local overrides when server values change, as long as we aren't in the middle of a vibe toggle
  const recentVibesStr = JSON.stringify(serverRecentVibes);
  const vibeDetailsStr = JSON.stringify(serverVibeDetails);

  useEffect(() => {
    if (!isVibingRef.current) {
      setLocalVibeCount(null);
      setLocalRecentVibes(null);
      setLocalVibeDetails(null);
      setLocalHasVibed(null);
      setLocalSelectedVibe(undefined);
    }
  }, [serverVibeCount, recentVibesStr, vibeDetailsStr, serverHasVibed, serverSelectedVibe]);

  /**
   * Updates vibeDetails optimistically for the current user.
   */
  const updateVibeDetails = useCallback(
    (currentDetails: VibeDetail[], emoji: string, isRemoving: boolean): VibeDetail[] => {
      if (!currentUserId) return currentDetails;

      if (isRemoving) {
        return currentDetails.filter(v => v.userId !== currentUserId);
      }

      const nameToUse = currentUserName || 'You';
      const updated = [...currentDetails];
      const existingIndex = updated.findIndex(v => v.userId === currentUserId);

      if (existingIndex > -1) {
        updated[existingIndex] = { emoji, userId: currentUserId, userName: nameToUse };
      } else {
        updated.push({ emoji, userId: currentUserId, userName: nameToUse });
      }
      return updated;
    },
    [currentUserId, currentUserName],
  );

  /**
   * Handle a vibe selection. Works for both post-style (hasVibed toggle)
   * and comment-style (selectedVibe toggle) patterns.
   */
  const handleVibeSelection = useCallback(
    async (vibe: string) => {
      if (isVibingRef.current) return;
      isVibingRef.current = true;

      // Snapshot for rollback
      const prevCount = vibeCount;
      const prevRecentVibes = recentVibes;
      const prevVibeDetails = vibeDetails;
      const prevHasVibed = hasVibed;
      const prevSelectedVibe = selectedVibe;

      // Determine if we're removing or replacing
      const isRemoving = selectedVibe === vibe;
      const isReplacing = !isRemoving && selectedVibe != null;

      const newCount = isRemoving
        ? Math.max(0, prevCount - 1)
        : isReplacing
          ? prevCount // replacing doesn't change overall count
          : prevCount + 1;

      // Optimistic UI update
      triggerHaptic(isRemoving ? ImpactStyle.Light : ImpactStyle.Medium);
      setLocalVibeCount(newCount);

      setLocalSelectedVibe(isRemoving ? null : vibe);
      setLocalHasVibed(!isRemoving);

      // Optimistically update recentVibes array to avoid visual flicker
      const incrementEmoji = (arr: { emoji: string; count: number }[], emoji: string) => {
        const idx = arr.findIndex(rv => rv.emoji === emoji);
        if (idx > -1) {
          arr[idx].count += 1;
        } else {
          arr.push({ emoji, count: 1 });
        }
      };

      let updatedVibes = prevRecentVibes.map(rv => ({ ...rv }));
      if (isRemoving) {
        const idx = updatedVibes.findIndex(rv => rv.emoji === vibe);
        if (idx > -1) {
          updatedVibes[idx].count = Math.max(0, updatedVibes[idx].count - 1);
          if (updatedVibes[idx].count === 0) updatedVibes.splice(idx, 1);
        }
      } else if (isReplacing && prevSelectedVibe) {
        // Decrement old emoji
        const oldIdx = updatedVibes.findIndex(rv => rv.emoji === prevSelectedVibe);
        if (oldIdx > -1) {
          updatedVibes[oldIdx].count = Math.max(0, updatedVibes[oldIdx].count - 1);
          if (updatedVibes[oldIdx].count === 0) updatedVibes.splice(oldIdx, 1);
        }
        incrementEmoji(updatedVibes, vibe);
      } else {
        incrementEmoji(updatedVibes, vibe);
      }
      setLocalRecentVibes(updatedVibes.sort((a, b) => b.count - a.count).slice(0, 3));

      if (canSeeReactors) {
        setLocalVibeDetails(updateVibeDetails(prevVibeDetails, vibe, isRemoving));
      }

      try {
        const result = await toggleVibe(targetId, targetType, vibe);

        // Reconcile with server response
        setLocalVibeCount(result.newCount);
        if (result.recentVibes) {
          setLocalRecentVibes(result.recentVibes);
        }

        setLocalSelectedVibe(result.vibed ? vibe : null);
        setLocalHasVibed(result.vibed);

        if (canSeeReactors) {
          // If the server returned updated details, use them; otherwise fall back to optimistic update
          if ('vibeDetails' in result && result.vibeDetails) {
            setLocalVibeDetails(result.vibeDetails);
          } else {
            setLocalVibeDetails(updateVibeDetails(prevVibeDetails, vibe, !result.vibed));
          }
        }
      } catch {
        // Rollback on error
        setLocalVibeCount(prevCount);
        setLocalRecentVibes(prevRecentVibes);
        setLocalVibeDetails(prevVibeDetails);
        setLocalSelectedVibe(prevSelectedVibe);
        setLocalHasVibed(prevHasVibed);
      } finally {
        isVibingRef.current = false;
      }
    },
    [targetId, targetType, vibeCount, recentVibes, vibeDetails, hasVibed, selectedVibe, canSeeReactors, updateVibeDetails],
  );

  return {
    vibeCount,
    recentVibes,
    vibeDetails,
    hasVibed,
    selectedVibe,
    handleVibeSelection,
  };
}
