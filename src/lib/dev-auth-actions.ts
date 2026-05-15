'use server';

/**
 * @fileoverview Dev-only login bypass actions.
 * This file is only imported in development mode via dynamic import
 * in the login page. It is NOT imported in production builds.
 */

import { revalidatePath } from 'next/cache';

export async function devLoginAction(role: 'admin' | 'member' | 'speaker' | 'free' | 'dustin') {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Forbidden');
  }
  // Defense-in-depth: even if NODE_ENV leaks, this blocks without the secret
  if (!process.env.DEV_BYPASS_SECRET || process.env.DEV_BYPASS_SECRET !== 'local-dev-only') {
    throw new Error('Forbidden: DEV_BYPASS_SECRET not configured');
  }
  const ObjectDb = await import('@/db');
  const sessionAuth = await import('@/lib/auth/session');
  
  const targetId = role === 'admin'
    ? 'test-service-admin'
    : role === 'dustin'
    ? 'dustin'
    : role === 'free'
    ? 'test-free-user'
    : role === 'speaker'
    ? 'test-speaker-user'
    : 'test-service-member';
  
  const devUser = await ObjectDb.db.query.users.findFirst({
    where: (users, { eq }) => eq(users.id, targetId),
  });

  if (!devUser) throw new Error('Service user not found. Seed DB first.');
  
  await sessionAuth.createSession(devUser.id);
  revalidatePath('/');
  return true;
}
