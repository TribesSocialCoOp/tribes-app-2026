
"use client";

import { useEffect, useState } from 'react';
import type { UserProfile, UserRole } from '@/lib/types';
import { getCurrentUserId } from '@/lib/actions/shared';
import { getUserProfile } from '@/lib/actions/profile-actions';

interface UseUserOutput {
  role: UserRole | null;
  user: UserProfile | null;
  isLoading: boolean;
}

/**
 * A centralized hook to get the current user's information.
 * Fetches the user profile based on the current session.
 */
export function useUser(): UseUserOutput {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchUser() {
      try {
        const userId = await getCurrentUserId();
        if (userId) {
          const profile = await getUserProfile(userId);
          setUser(profile);
        }
      } catch (error) {
        console.error("Failed to fetch user:", error);
      } finally {
        setIsLoading(false);
      }
    }
    fetchUser();
  }, []);

  return {
    role: user?.role ?? null,
    user: user,
    isLoading
  };
}
