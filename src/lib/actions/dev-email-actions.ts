'use server';

import type { DevMailboxEntry } from '@/lib/services/email-service';

/**
 * Server actions for dev mailbox inspection (DEV only).
 */

export async function getDevMailboxAction(): Promise<DevMailboxEntry[]> {
  if (process.env.NODE_ENV === 'production') return [];
  const { getDevMailbox } = await import('@/lib/services/email-service');
  return getDevMailbox();
}

export async function clearDevMailboxAction(): Promise<void> {
  if (process.env.NODE_ENV === 'production') return;
  const { clearDevMailbox } = await import('@/lib/services/email-service');
  await clearDevMailbox();
}
