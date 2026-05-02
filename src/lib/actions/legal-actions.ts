"use server";

/**
 * @fileoverview Server actions for legal document management.
 * Handles TOS acceptance tracking against versioned markdown files.
 */

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { getCurrentUserId } from '@/lib/actions/shared';
import { getLatestLegalDocument } from '@/lib/legal-content';

/**
 * Record the user's acceptance of the current Terms of Service version.
 * Validates that the provided version matches an actual file on disk.
 */
export async function acceptTermsOfService(version: string): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) return { success: false, error: 'Not authenticated' };

    // Validate the version matches the latest published TOS
    const latestTos = await getLatestLegalDocument('terms');
    if (latestTos.version !== version) {
      return { success: false, error: 'Version mismatch. Please refresh and try again.' };
    }

    await db.update(users)
      .set({ tosAcceptedVersion: version })
      .where(eq(users.id, userId));

    return { success: true };
  } catch (error) {
    console.error('[legal] Failed to accept TOS:', error);
    return { success: false, error: 'An unexpected error occurred.' };
  }
}

/**
 * Get the latest TOS version and content for client-side display.
 * This is a server action so the TOS gate component can fetch it.
 */
export async function getLatestTosVersion(): Promise<{
  version: string;
  effectiveDate: string;
  content: string;
}> {
  const doc = await getLatestLegalDocument('terms');
  return {
    version: doc.version,
    effectiveDate: doc.effectiveDate,
    content: doc.content,
  };
}
