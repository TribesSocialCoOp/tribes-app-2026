'use server';

import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { loginLimiter, getClientIp } from '@/lib/auth/rate-limit';

/**
 * Sends a passkey recovery email. Always succeeds (no user enumeration).
 * Rate-limited by IP to prevent abuse.
 */
export async function requestPasskeyRecovery(email: string): Promise<void> {
  // Rate limit by IP
  const headersList = await headers();
  const ip = getClientIp(headersList);
  await loginLimiter.check(ip);

  // Look up user — but never reveal whether they exist
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.email, email)).limit(1);

  if (!user?.email) return; // Silently succeed

  // Create recovery token and send email
  const { createVerificationToken } = await import('@/lib/services/email-token-service');
  const { sendEmail } = await import('@/lib/services/email-service');
  const { passKeyRecoveryEmail } = await import('@/lib/services/email-templates');

  const token = await createVerificationToken(user.id, 'passkey_recovery');
  const { getBaseUrl } = await import('@/lib/url');
  const baseUrl = await getBaseUrl();
  const recoveryUrl = `${baseUrl}/api/auth/recover?token=${encodeURIComponent(token)}`;

  const emailContent = passKeyRecoveryEmail(user.name, recoveryUrl);
  await sendEmail({ to: user.email, ...emailContent });
}

/**
 * Resends the email verification link for the current user.
 */
export async function resendVerificationEmail(userId: string): Promise<void> {
  const [user] = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(users).where(eq(users.id, userId)).limit(1);

  if (!user?.email) throw new Error('No email address on file');

  const { createVerificationToken } = await import('@/lib/services/email-token-service');
  const { sendEmail } = await import('@/lib/services/email-service');
  const { verifyEmailTemplate } = await import('@/lib/services/email-templates');

  const token = await createVerificationToken(user.id, 'verify_email');
  const { getBaseUrl } = await import('@/lib/url');
  const baseUrl = await getBaseUrl();
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;

  const emailContent = verifyEmailTemplate(user.name, verifyUrl);
  await sendEmail({ to: user.email, ...emailContent });
}
