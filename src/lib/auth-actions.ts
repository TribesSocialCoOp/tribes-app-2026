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
import { eq, or } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { loginLimiter, signupLimiter, signupSubnetLimiter, passwordLoginLimiter, totpChallengeLimiter, getClientIp, getSubnet } from '@/lib/auth/rate-limit';
import bcrypt from 'bcryptjs';
import { isAuthMethodEnabled } from '@/lib/auth/auth-config';

export async function registerUserAction(name: string, email: string, inviteCode?: string, turnstileToken?: string, altchaPayload?: string): Promise<
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

  // Bot challenge validation (ALTCHA primary, Turnstile fallback)
  if (altchaPayload) {
    const { verifyAltchaPayload } = await import('@/lib/services/altcha-service');
    const isBotChallengeValid = await verifyAltchaPayload(altchaPayload);
    if (!isBotChallengeValid) {
      throw new Error('Bot check failed. Please refresh the page and try again.');
    }
  } else if (turnstileToken) {
    const { validateTurnstileToken } = await import('@/lib/services/turnstile-service');
    await validateTurnstileToken(turnstileToken, ip);
  } else {
    console.warn('[auth-actions] No bot check token provided. Subnet/IP rate limits still active.');
  }

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
  }

  // Generate WebAuthn options (passing name & email to bypass DB check for new users)
  const options = await startRegistration(userId, name, email);

  // Store validated registration context in a signed httpOnly cookie so that
  // finishRegistrationAction does NOT need to trust client-supplied values.
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const regContext = JSON.stringify({
    userId,
    name,
    email,
    inviteCode: inviteCode?.trim().toUpperCase() || null,
  });
  const hmac = await signRegistrationContext(regContext);
  cookieStore.set('webauthn_reg_ctx', `${hmac}.${Buffer.from(regContext).toString('base64url')}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 60 * 5, // 5 minutes — same as the challenge
  });

  return { options, userId, inviteCode: inviteCode?.trim().toUpperCase() };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.';
    return { error: message };
  }
}

export async function finishRegistrationAction(
  userId: string,
  response: RegistrationResponseJSON,
  _name: string,
  _email: string,
  _inviteCode?: string,
) {
  // Read and verify the server-signed registration context cookie
  // instead of trusting the client-supplied name/email/inviteCode.
  const { cookies } = await import('next/headers');
  const cookieStore = await cookies();
  const ctxCookie = cookieStore.get('webauthn_reg_ctx')?.value;
  if (!ctxCookie) throw new Error('Registration session expired. Please try again.');

  const dotIdx = ctxCookie.indexOf('.');
  if (dotIdx === -1) throw new Error('Invalid registration context');
  const hmac = ctxCookie.slice(0, dotIdx);
  const payload = ctxCookie.slice(dotIdx + 1);
  const regContextJson = Buffer.from(payload, 'base64url').toString('utf-8');

  // Verify HMAC to ensure the cookie was not tampered with
  const expectedHmac = await signRegistrationContext(regContextJson);
  if (hmac !== expectedHmac) throw new Error('Registration context integrity check failed');

  const regContext = JSON.parse(regContextJson) as {
    userId: string;
    name: string;
    email: string;
    inviteCode: string | null;
  };

  // Enforce that the userId from the client matches the one we stored
  if (regContext.userId !== userId) {
    throw new Error('User ID mismatch. Please restart registration.');
  }

  // Use server-validated values from the cookie, NOT client-supplied ones
  const { name, email, inviteCode } = regContext;

  // Pass name and email to finishRegistration so it can create the user row inside a transaction
  const result = await finishRegistration(userId, response, name, email);
  revalidatePath('/');

  // Clean up the registration context cookie
  cookieStore.delete('webauthn_reg_ctx');

  // Auto-redeem invite code if provided
  if (inviteCode) {
    try {
      const { redeemInviteCode } = await import('@/lib/services/invite-service');
      await redeemInviteCode(userId, inviteCode);
    } catch (e) {
      // Don't fail registration if redemption fails (user already created)
      console.warn('[auth] Invite code redemption failed:', e);
    }
  }

  // Auto-join the welcome tribe (looked up by slug, not hardcoded ID)
  try {
    const { joinTribeDirectly } = await import('@/lib/services/tribe-service');
    const { tribes: tribesTable } = await import('@/db/schema');
    const [welcomeTribe] = await db.select({ id: tribesTable.id })
      .from(tribesTable)
      .where(eq(tribesTable.slug, 'welcome-to-tribes'))
      .limit(1);
    if (welcomeTribe) {
      await joinTribeDirectly(userId, welcomeTribe.id);
    }
  } catch (e) {
    console.warn('[auth] Auto-join welcome tribe failed:', e);
  }

  // Fire-and-forget: Send welcome + verification emails
  firePostRegistrationEmails(userId).catch(() => {});

  return result;
}

// ── HMAC Signing ────────────────────────────────────────────────────
// Signs registration context with a server secret so the cookie can't
// be forged or tampered with by the client.

async function signRegistrationContext(payload: string): Promise<string> {
  const crypto = await import('crypto');
  // Use the WebAuthn origin secret as HMAC key — it's always set and server-only
  const secret = process.env.WEBAUTHN_ORIGIN || process.env.AUTH_SECRET || 'tribes-dev-secret';
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
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

export async function registerWithPasswordAction(
  name: string,
  email: string,
  username: string,
  password: string,
  inviteCode?: string,
  turnstileToken?: string,
  altchaPayload?: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    if (!isAuthMethodEnabled('password')) {
      return { error: 'Password registration is not enabled on this instance.' };
    }

    const trimmedUsername = username.trim().toLowerCase();
    if (!trimmedUsername || !/^[a-zA-Z0-9_-]+$/.test(trimmedUsername)) {
      return { error: 'Username must contain only letters, numbers, underscores, and hyphens.' };
    }

    // Password strength check (12+ characters, 1 uppercase, 1 lowercase, 1 number/symbol)
    if (password.length < 12) {
      return { error: 'Password must be at least 12 characters long.' };
    }
    if (!/[A-Z]/.test(password)) {
      return { error: 'Password must contain at least one uppercase letter.' };
    }
    if (!/[a-z]/.test(password)) {
      return { error: 'Password must contain at least one lowercase letter.' };
    }
    if (!/[0-9]/.test(password) && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      return { error: 'Password must contain at least one number or symbol.' };
    }

    // Rate limit signup by IP
    const headersList = await headers();
    const ip = getClientIp(headersList);
    await signupLimiter.check(ip);

    // Subnet level swarm detection
    const subnet = getSubnet(ip);
    await signupSubnetLimiter.check(subnet);

    // Bot challenge validation (ALTCHA primary, Turnstile fallback)
    if (altchaPayload) {
      const { verifyAltchaPayload } = await import('@/lib/services/altcha-service');
      const isBotChallengeValid = await verifyAltchaPayload(altchaPayload);
      if (!isBotChallengeValid) {
        throw new Error('Bot check failed. Please refresh the page and try again.');
      }
    } else if (turnstileToken) {
      const { validateTurnstileToken } = await import('@/lib/services/turnstile-service');
      await validateTurnstileToken(turnstileToken, ip);
    } else {
      console.warn('[auth-actions] No bot check token provided. Subnet/IP rate limits still active.');
    }

    // Invite code validation
    const inviteOnly = process.env.NEXT_PUBLIC_INVITE_ONLY === 'true';
    if (inviteOnly) {
      if (!inviteCode?.trim()) {
        return { error: 'An invite code is required to join Tribes.' };
      }
      const { validateInviteCode } = await import('@/lib/services/invite-service');
      await validateInviteCode(inviteCode);
    }

    // Check duplicate email or username
    const existingUser = await db.query.users.findFirst({
      where: or(
        eq(users.email, email),
        eq(users.username, trimmedUsername)
      ),
    });

    if (existingUser) {
      if (existingUser.email === email) {
        return { error: 'An account with this email already exists.' };
      }
      if (existingUser.username === trimmedUsername) {
        return { error: 'Username is already taken.' };
      }
    }

    const userId = uuidv4();
    const passwordHash = await bcrypt.hash(password, 12);

    const { generateUniqueSlug } = await import('@/lib/utils/slugify');
    const userSlug = await generateUniqueSlug(trimmedUsername, async (candidate) => {
      const existing = await db.query.users.findFirst({
        where: eq(users.slug, candidate),
      });
      return !!existing;
    });

    // Create user inside a transaction
    await db.transaction(async (tx) => {
      await tx.insert(users).values({
        id: userId,
        name,
        email,
        username: trimmedUsername,
        passwordHash,
        slug: userSlug,
        emailVerified: false, // Must verify email before creating content/tribes
        role: 'Human_Free',
        createdAt: new Date(),
      });
    });

    // Invite code redemption — MUST run AFTER the user transaction commits.
    // redeemInviteCode opens its own db.transaction() which needs the user row
    // to already exist (FK constraint on subscriptions.user_id → users.id).
    if (inviteCode) {
      try {
        const { redeemInviteCode } = await import('@/lib/services/invite-service');
        await redeemInviteCode(userId, inviteCode);
      } catch (e) {
        // Don't fail registration if redemption fails (user already created)
        console.warn('[auth] Invite code redemption failed:', e);
      }
    }

    // Auto-join welcome tribe (non-critical, don't block registration)
    try {
      const { joinTribeDirectly } = await import('@/lib/services/tribe-service');
      const { tribes: tribesTable } = await import('@/db/schema');
      const [welcomeTribe] = await db.select({ id: tribesTable.id })
        .from(tribesTable)
        .where(eq(tribesTable.slug, 'welcome-to-tribes'))
        .limit(1);
      if (welcomeTribe) {
        await joinTribeDirectly(userId, welcomeTribe.id);
      }
    } catch (e) {
      console.warn('[auth] Auto-join welcome tribe failed:', e);
    }

    // Set up session
    const sessionAuth = await import('@/lib/auth/session');
    await sessionAuth.createSession(userId);

    revalidatePath('/');

    // Fire-and-forget email notifications
    firePostRegistrationEmails(userId).catch(() => {});

    return { success: true };
  } catch (e) {
    // SECURITY: Never leak raw SQL queries or internal details to users.
    // Drizzle/node-postgres includes the full query + params in error messages.
    const rawMessage = e instanceof Error ? e.message : '';
    let message: string;
    if (rawMessage.includes('Failed query') || rawMessage.includes('violates') || rawMessage.includes('duplicate key')) {
      console.error('[auth] Registration DB error (sanitized for client):', rawMessage);
      message = 'Registration failed due to a server error. Please try again.';
    } else if (rawMessage.includes('Rate limit')) {
      message = rawMessage; // Rate limit messages are safe to show
    } else {
      message = rawMessage || 'An unexpected error occurred. Please try again.';
    }
    return { error: message };
  }
}

export async function loginWithPasswordAction(
  emailOrUsername: string,
  password: string,
  turnstileToken?: string,
  altchaPayload?: string
): Promise<{ success: boolean; requiresTotp?: false } | { error: string } | { requiresTotp: true; challengeToken: string }> {
  try {
    if (!isAuthMethodEnabled('password')) {
      return { error: 'Password authentication is not enabled on this instance.' };
    }

    // Rate limit password login attempts strictly
    const headersList = await headers();
    const ip = getClientIp(headersList);
    await passwordLoginLimiter.check(ip);

    // Bot challenge validation if passed
    if (altchaPayload) {
      const { verifyAltchaPayload } = await import('@/lib/services/altcha-service');
      const isBotChallengeValid = await verifyAltchaPayload(altchaPayload);
      if (!isBotChallengeValid) {
        throw new Error('Bot check failed. Please refresh the page and try again.');
      }
    } else if (turnstileToken) {
      const { validateTurnstileToken } = await import('@/lib/services/turnstile-service');
      await validateTurnstileToken(turnstileToken, ip);
    }

    const trimmedInput = emailOrUsername.trim().toLowerCase();

    // Look up by email or username
    const user = await db.query.users.findFirst({
      where: or(
        eq(users.email, trimmedInput),
        eq(users.username, trimmedInput)
      ),
    });

    // Timing attack mitigation: always run bcrypt.compare even if user not found.
    const dummyHash = '$2a$12$12345678901234567890123456789012345678901234567890123';
    const hashToCompare = user?.passwordHash || dummyHash;
    const isValid = await bcrypt.compare(password, hashToCompare);

    if (!user || !user.passwordHash || !isValid) {
      return { error: 'Invalid email/username or password.' };
    }

    // TOTP 2FA enforcement — issue a signed, short-lived challenge token
    // so the client cannot call verifyTotpAndLoginAction with an arbitrary userId
    if (user.totpEnabled) {
      const { createTotpChallengeToken } = await import('@/lib/auth/totp-challenge');
      const challengeToken = await createTotpChallengeToken(user.id);
      return { requiresTotp: true, challengeToken };
    }

    // Create session
    const sessionAuth = await import('@/lib/auth/session');
    await sessionAuth.createSession(user.id);

    revalidatePath('/');
    return { success: true, requiresTotp: false };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.';
    return { error: message };
  }
}

export async function verifyTotpAndLoginAction(
  challengeToken: string,
  code: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    // Rate limit TOTP attempts per IP — 6 digits = 1M combos, must be throttled
    const headersList = await headers();
    const ip = getClientIp(headersList);
    await totpChallengeLimiter.check(ip);

    // Verify the challenge token to extract the userId — proves password was already validated
    const { verifyTotpChallengeToken } = await import('@/lib/auth/totp-challenge');
    const userId = await verifyTotpChallengeToken(challengeToken);
    if (!userId) {
      return { error: 'Challenge expired or invalid. Please log in again.' };
    }

    const { TOTP } = await import('otpauth');
    const [user] = await db.select({ totpSecret: users.totpSecret, totpEnabled: users.totpEnabled })
      .from(users).where(eq(users.id, userId)).limit(1);

    if (!user?.totpEnabled || !user.totpSecret) {
      return { error: 'TOTP not configured for this account.' };
    }

    const totp = new TOTP({
      issuer: 'Tribes.app',
      label: userId,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: user.totpSecret,
    });

    const delta = totp.validate({ token: code, window: 1 });
    if (delta === null) return { error: 'Invalid verification code.' };

    const sessionAuth = await import('@/lib/auth/session');
    await sessionAuth.createSession(userId);
    revalidatePath('/');
    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred.';
    return { error: message };
  }
}

export async function requestPasswordResetAction(
  emailOrUsername: string,
  turnstileToken?: string,
  altchaPayload?: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    if (!isAuthMethodEnabled('password')) {
      return { error: 'Password authentication is not enabled on this instance.' };
    }

    const headersList = await headers();
    const ip = getClientIp(headersList);

    // Bot challenge validation if passed
    if (altchaPayload) {
      const { verifyAltchaPayload } = await import('@/lib/services/altcha-service');
      const isBotChallengeValid = await verifyAltchaPayload(altchaPayload);
      if (!isBotChallengeValid) {
        throw new Error('Bot check failed. Please refresh the page and try again.');
      }
    } else if (turnstileToken) {
      const { validateTurnstileToken } = await import('@/lib/services/turnstile-service');
      await validateTurnstileToken(turnstileToken, ip);
    }

    const trimmedInput = emailOrUsername.trim().toLowerCase();

    // Look up by email or username
    const user = await db.query.users.findFirst({
      where: or(
        eq(users.email, trimmedInput),
        eq(users.username, trimmedInput)
      ),
    });

    // Timing-safe response: if user doesn't exist, we still return success
    // to prevent user enumeration.
    if (user && user.email) {
      const { createVerificationToken } = await import('@/lib/services/email-token-service');
      const token = await createVerificationToken(user.id, 'password_reset');

      const { getBaseUrl } = await import('@/lib/url');
      const baseUrl = await getBaseUrl();
      const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;

      const { sendEmail } = await import('@/lib/services/email-service');
      const emailContent = {
        subject: 'Reset your Tribes.app password',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
            <h2 style="color: #7c3aed; margin-top: 0;">Password Reset Request</h2>
            <p>Hi ${user.name},</p>
            <p>We received a request to reset the password for your Tribes.app account. Click the button below to set a new password:</p>
            <div style="margin: 24px 0; text-align: center;">
              <a href="${resetUrl}" style="background-color: #7c3aed; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reset Password</a>
            </div>
            <p style="color: #64748b; font-size: 0.875rem;">This link is valid for 15 minutes. If you did not request a password reset, you can safely ignore this email.</p>
          </div>
        `,
      };

      await sendEmail({ to: user.email, ...emailContent });
    }

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.';
    return { error: message };
  }
}

export async function resetPasswordAction(
  token: string,
  newPassword: string
): Promise<{ success: boolean } | { error: string }> {
  try {
    if (!isAuthMethodEnabled('password')) {
      return { error: 'Password authentication is not enabled on this instance.' };
    }

    // Password strength check (12+ characters, 1 uppercase, 1 lowercase, 1 number/symbol)
    if (newPassword.length < 12) {
      return { error: 'Password must be at least 12 characters long.' };
    }
    if (!/[A-Z]/.test(newPassword)) {
      return { error: 'Password must contain at least one uppercase letter.' };
    }
    if (!/[a-z]/.test(newPassword)) {
      return { error: 'Password must contain at least one lowercase letter.' };
    }
    if (!/[0-9]/.test(newPassword) && !/[!@#$%^&*(),.?":{}|<>]/.test(newPassword)) {
      return { error: 'Password must contain at least one number or symbol.' };
    }

    const { validateAndConsumeToken } = await import('@/lib/services/email-token-service');
    const { userId, type } = await validateAndConsumeToken(token);

    if (type !== 'password_reset') {
      return { error: 'Invalid token type.' };
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await db.transaction(async (tx) => {
      await tx.update(users)
        .set({ passwordHash })
        .where(eq(users.id, userId));

      // Revoke all existing sessions — the old password (and any attacker session) is now invalid
      const { sessions } = await import('@/db/schema');
      await tx.update(sessions)
        .set({ revokedAt: new Date() })
        .where(eq(sessions.userId, userId));
    });

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.';
    return { error: message };
  }
}

export async function resendVerificationEmailAction(): Promise<{ success?: boolean; error?: string }> {
  try {
    const { requireAuth } = await import('@/lib/actions/shared');
    const userId = await requireAuth();

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { error: 'User not found.' };
    }

    if (user.emailVerified) {
      return { error: 'Email is already verified.' };
    }

    if (!user.email) {
      return { error: 'No email address registered for this account.' };
    }

    const { sendEmail } = await import('@/lib/services/email-service');
    const { verifyEmailTemplate } = await import('@/lib/services/email-templates');
    const { createVerificationToken } = await import('@/lib/services/email-token-service');

    const token = await createVerificationToken(userId, 'verify_email');
    const { getBaseUrl } = await import('@/lib/url');
    const baseUrl = await getBaseUrl();
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
    const verify = verifyEmailTemplate(user.name, verifyUrl);
    
    await sendEmail({ to: user.email, ...verify });

    return { success: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'An unexpected error occurred.';
    return { error: message };
  }
}
