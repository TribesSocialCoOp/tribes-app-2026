"use client";

/**
 * @fileoverview Centralized user context provider.
 * 
 * Replaces the per-component useUser() hook pattern that was causing
 * N duplicate server action calls per page load. Now the user profile
 * is fetched ONCE at the (app)/layout.tsx level and distributed via context.
 */

import React, { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { UserProfile, UserRole } from '@/lib/types';
import { getCurrentUserId } from '@/lib/actions/shared';
import { getUserProfile } from '@/lib/actions/profile-actions';

interface UserContextValue {
  user: UserProfile | null;
  role: UserRole | null;
  isLoading: boolean;
  /** Force a re-fetch (e.g. after profile update or role change) */
  refresh: () => void;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  role: null,
  isLoading: true,
  refresh: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchUser() {
      // Only show loading spinner on initial mount, not on refresh re-fetches
      if (refreshKey === 0) setIsLoading(true);
      try {
        let userId: string | null = null;
        let attempts = 0;
        
        // Retry logic for session hydration lag
        while (attempts < 3) {
          userId = await getCurrentUserId();
          if (userId || cancelled) break;
          
          // If no user found, wait and retry a couple of times
          // This handles transient lag during client-side navigation/hydration
          await new Promise(r => setTimeout(r, 500 * (attempts + 1)));
          attempts++;
        }

        if (cancelled) return;
        
        if (userId) {
          const profile = await getUserProfile(userId);
          if (cancelled) return;
          setUser(profile);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error("[UserProvider] Failed to fetch user:", error);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchUser();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const refresh = () => setRefreshKey(k => k + 1);

  return (
    <UserContext.Provider value={{ user, role: user?.role ?? null, isLoading, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

/**
 * Hook to access user context. Must be used within a <UserProvider>.
 * Drop-in replacement for the old useUser() hook.
 */
export function useUser(): UserContextValue {
  return useContext(UserContext);
}
