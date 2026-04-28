'use server';

import { 
  startRegistration, 
  finishRegistration, 
  startAuthentication, 
  finishAuthentication 
} from './auth/passkeys';
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from '@simplewebauthn/server';
import { db } from '@/db';
import { users } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { loginLimiter, signupLimiter, signupSubnetLimiter, getClientIp, getSubnet } from '@/lib/auth/rate-limit';

export async function registerUserAction(name: string, email: string, inviteCode?: string, turnstileToken?: string): Promise<
  { options: Awaited<ReturnType<typeof startRegistration>>; userId: string; inviteCode?: string } |
  { error: string }
> {
  try {
  // Rate limit signup by IP
  const headersList = await headers();
  const ip = getClientIp(headersList);
  await signupLimiter.check(ip);

  // Subnet-level swarm detection: catches residential proxy bots rotating IPs in the same block
  const subnet = getSubnet(ip);
  await signupSubnetLimiter.check(subnet);

  // Cloudflare Turnstile bot challenge
  const { validateTurnstileToken } = await import('@/lib/services/turnstile-service');
  await validateTurnstileToken(turnstileToken, ip);

  // Server-side invite code enforcement
  const inviteOnly = process.env.NEXT_PUBLIC_INVITE_ONLY === 'true';
  if (inviteOnly) {
    if (!inviteCode?.trim()) {
      return { error: 'An invite code is required to join Tribes.' };
    }
    // Validate the code (throws if invalid/expired/used up)
    const { validateInviteCode } = await import('@/lib/services/invite-service');
    await validateInviteCode(inviteCode);
  }

  // Check if user exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  let userId: string;

  if (existingUser) {
    // User already has an account — check if they have a passkey or just a pending registration
    const { credentials: credTable } = await import('@/db/schema');
    const existingCred = await db.query.credentials.findFirst({
      where: eq(credTable.userId, existingUser.id),
    });
    if (existingCred) {
      return { error: 'An account with this email already exists. Try logging in instead.' };
    }
    // Pending account (no passkey yet) — allow re-registration attempt
    userId = existingUser.id;
  } else {
    userId = uuidv4();
    await db.insert(users).values({
      id: userId,
      name,
      email,
      role: 'Human_Free',
      createdAt: new Date(),
    });
  }

  // Generate WebAuthn options
  const options = await startRegistration(userId);
  return { options, userId, inviteCode: inviteCode?.trim().toUpperCase() };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.';
    return { error: message };
  }
}

export async function finishRegistrationAction(
  userId: string,
  response: RegistrationResponseJSON,
  inviteCode?: string,
) {
  const result = await finishRegistration(userId, response);
  revalidatePath('/');

  // Auto-redeem invite code if provided
  if (inviteCode?.trim()) {
    try {
      const { redeemInviteCode } = await import('@/lib/services/invite-service');
      await redeemInviteCode(userId, inviteCode);
    } catch (e) {
      // Don't fail registration if redemption fails (user already created)
      console.warn('[auth] Invite code redemption failed:', e);
    }
  }

  // Fire-and-forget: Send welcome + verification emails
  firePostRegistrationEmails(userId).catch(() => {});

  return result;
}

async function firePostRegistrationEmails(userId: string) {
  const { sendEmail } = await import('@/lib/services/email-service');
  const { welcomeEmail, verifyEmailTemplate } = await import('@/lib/services/email-templates');
  const { createVerificationToken } = await import('@/lib/services/email-token-service');

  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
  });
  if (!user?.email) return;

  // Welcome email
  const welcome = welcomeEmail(user.name);
  await sendEmail({ to: user.email, ...welcome });

  // Verification email
  const token = await createVerificationToken(userId, 'verify_email');
  const { getBaseUrl } = await import('@/lib/url');
  const baseUrl = await getBaseUrl();
  const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
  const verify = verifyEmailTemplate(user.name, verifyUrl);
  await sendEmail({ to: user.email, ...verify });
}

export async function loginUserAction() {
  // Rate limit login by IP
  const headersList = await headers();
  const ip = getClientIp(headersList);
  await loginLimiter.check(ip);

  return await startAuthentication();
}

export async function finishLoginAction(response: AuthenticationResponseJSON) {
  const result = await finishAuthentication(response);
  revalidatePath('/');
  return result;
}

export async function logoutAction() {
  const sessionAuth = await import('@/lib/auth/session');
  await sessionAuth.deleteSession();
  revalidatePath('/');
}
