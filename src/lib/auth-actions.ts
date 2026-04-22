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
import { loginLimiter, signupLimiter, getClientIp } from '@/lib/auth/rate-limit';

export async function registerUserAction(name: string, email: string) {
  // Rate limit signup by IP
  const headersList = await headers();
  const ip = getClientIp(headersList);
  await signupLimiter.check(ip);

  // Check if user exists
  const existingUser = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  let userId: string;

  if (existingUser) {
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
  return { options, userId };
}

export async function finishRegistrationAction(userId: string, response: RegistrationResponseJSON) {
  const result = await finishRegistration(userId, response);
  revalidatePath('/');

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
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:9002';
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
