
/**
 * @fileoverview Service layer for user profile actions.
 */
import { mockUserProfile } from '@/lib/data';
import type { UserProfile } from '@/lib/types';

/**
 * Simulates fetching the current user's profile.
 * @param userId The ID of the user to fetch.
 */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  console.log(`Service: Fetching profile for user ${userId}`);
  // In a real app, you would fetch this from your database.
  // Here, we check if the requested ID matches our mock user.
  if (userId === mockUserProfile.id) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve({ ...mockUserProfile }); // Return a copy
      }, 150);
    });
  }
  return Promise.resolve(null);
}

/**
 * Simulates updating a user's profile.
 * @param userId The ID of the user to update.
 * @param updates The profile fields to update.
 */
export async function updateUserProfile(userId: string, updates: Partial<Omit<UserProfile, 'id' | 'role' | 'email'>>): Promise<UserProfile | null> {
  console.log(`Service: Updating profile for user ${userId}`, updates);
  if (userId === mockUserProfile.id) {
    return new Promise(resolve => {
      setTimeout(() => {
        // Update the mock data object
        mockUserProfile = { ...mockUserProfile, ...updates };
        resolve({ ...mockUserProfile });
      }, 300);
    });
  }
  return Promise.resolve(null);
}
