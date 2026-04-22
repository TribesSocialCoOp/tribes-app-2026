/**
 * @fileoverview Email Templates for Tribes.app (P4-1 + P4-2).
 * 
 * All templates use inline CSS (email-safe, no external stylesheets).
 * Each returns { subject, html, text } for use with sendEmail().
 * 
 * Templates:
 *   1. welcomeEmail         — Post-signup welcome
 *   2. verifyEmailTemplate  — Email verification link
 *   3. passKeyRecoveryEmail — Account recovery magic link
 *   4. bondRequestEmail     — New bond request notification
 *   5. familyIntroEmail     — Family introduction notification
 *   6. eventReminderEmail   — Upcoming event reminder
 */

// ============================================================
// SHARED LAYOUT
// ============================================================

const BRAND_COLOR = '#6366f1'; // Indigo-500
const BRAND_GRADIENT = 'linear-gradient(135deg, #6366f1, #8b5cf6)';
const FONT_STACK = "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

interface LayoutOptions {
  content: string;
  preheader?: string;
  unsubscribeUrl?: string;
}

function emailLayout({ content, preheader, unsubscribeUrl }: LayoutOptions): string {
  const unsubscribeLink = unsubscribeUrl
    ? `<p style="margin:8px 0 0;"><a href="${unsubscribeUrl}" style="color:#a1a1aa;text-decoration:underline;">Unsubscribe from these emails</a></p>`
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tribes.app</title>
  ${preheader ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:${FONT_STACK};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 0;">
    <tr>
      <td align="center">
        <!-- Header -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:0 0 24px;">
              <div style="font-size:28px;font-weight:800;color:${BRAND_COLOR};letter-spacing:-0.5px;">Tribes.app</div>
            </td>
          </tr>
        </table>
        <!-- Content Card -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding:32px 32px 24px;">
              ${content}
            </td>
          </tr>
        </table>
        <!-- Footer -->
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:24px 0;color:#a1a1aa;font-size:12px;line-height:1.5;">
              <p style="margin:0;">Tribes.app — Secure, local-first community platform</p>
              <p style="margin:4px 0 0;">You received this because you have an account on Tribes.app.</p>
              ${unsubscribeLink}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ctaButton(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="background:${BRAND_GRADIENT};border-radius:8px;">
        <a href="${url}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// ============================================================
// 1. WELCOME EMAIL (no unsubscribe — account lifecycle)
// ============================================================

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  const subject = `Welcome to Tribes.app, ${name}! 🎉`;

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Welcome to Tribes.app!</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hey <strong>${name}</strong>, you're in! Here's what you can do:
    </p>
    <ul style="margin:0 0 16px;padding-left:20px;font-size:15px;color:#52525b;line-height:1.8;">
      <li><strong>Form Bonds</strong> — Connect with friends and family through encrypted channels</li>
      <li><strong>Join Tribes</strong> — Find or create communities around shared interests</li>
      <li><strong>Attend Events</strong> — RSVP to gatherings and earn reputation points</li>
      <li><strong>Build Reputation</strong> — Grow your standing through positive engagement</li>
    </ul>
    <p style="margin:0 0 8px;font-size:15px;color:#71717a;">
      Your data is local-first and your messages are end-to-end encrypted. Only you and your bonds can read them.
    </p>
  `,
    preheader: `Welcome to Tribes.app! Here's what you can do.`,
  });

  const text = `Welcome to Tribes.app, ${name}!\n\nYou're in! Form bonds, join tribes, attend events, and build your reputation.\n\nYour data is local-first and your messages are E2E encrypted.`;

  return { subject, html, text };
}

// ============================================================
// 2. EMAIL VERIFICATION (no unsubscribe — account lifecycle)
// ============================================================

export function verifyEmailTemplate(name: string, verifyUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Verify your email — Tribes.app';

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Verify Your Email</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${name}</strong>, please verify your email address to help us keep your account secure.
    </p>
    ${ctaButton('Verify Email', verifyUrl)}
    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
      This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
    </p>
  `,
    preheader: `Verify your email to secure your Tribes.app account.`,
  });

  const text = `Hi ${name}, verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`;

  return { subject, html, text };
}

// ============================================================
// 3. PASSKEY RECOVERY (no unsubscribe — account lifecycle)
// ============================================================

export function passKeyRecoveryEmail(name: string, recoveryUrl: string): { subject: string; html: string; text: string } {
  const subject = 'Account Recovery — Tribes.app';

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Account Recovery</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${name}</strong>, we received a request to recover your account.
      Use the link below to sign in and register a new passkey.
    </p>
    ${ctaButton('Recover Account', recoveryUrl)}
    <div style="margin:16px 0;padding:12px 16px;background-color:#fef3c7;border-radius:8px;border-left:4px solid #f59e0b;">
      <p style="margin:0;font-size:14px;color:#92400e;line-height:1.5;">
        <strong>Important:</strong> This recovery link creates a temporary session to register a new passkey.
        Your existing bonds remain intact, but encrypted message history from your previous device may not be recoverable.
      </p>
    </div>
    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
      This link expires in 15 minutes. If you didn't request this, you can safely ignore it.
    </p>
  `,
    preheader: `Account recovery link for your Tribes.app account.`,
  });

  const text = `Hi ${name}, recover your account: ${recoveryUrl}\n\nThis link expires in 15 minutes. Your bonds remain intact but encrypted message history may not be recoverable.`;

  return { subject, html, text };
}

// ============================================================
// 4. BOND REQUEST (unsubscribable: bondMessages)
// ============================================================

export function bondRequestEmail(
  name: string,
  fromName: string,
  bondType: string,
  unsubscribeUrl?: string,
): { subject: string; html: string; text: string } {
  const subject = `${fromName} wants to form a ${bondType} bond — Tribes.app`;

  const bondEmoji: Record<string, string> = {
    family: '👨‍👩‍👦',
    friend: '🤝',
    professional: '💼',
    collaborator: '🔧',
    follower: '👤',
    supporter: '💎',
  };

  const emoji = bondEmoji[bondType] ?? '🤝';

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">New Bond Request</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${name}</strong>, you have a new bond request!
    </p>
    <div style="margin:16px 0;padding:16px;background-color:#f4f4f5;border-radius:8px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">${emoji}</div>
      <p style="margin:0;font-size:18px;font-weight:600;color:#18181b;">${fromName}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#71717a;">
        wants to form a <strong style="color:${BRAND_COLOR};">${bondType}</strong> bond with you
      </p>
    </div>
    ${ctaButton('View Bond Request', '/bonds')}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">
      Log in to accept or decline this request.
    </p>
  `,
    preheader: `${fromName} wants to form a ${bondType} bond with you.`,
    unsubscribeUrl,
  });

  const text = `Hi ${name}, ${fromName} wants to form a ${bondType} bond with you on Tribes.app.\n\nLog in to accept or decline.`;

  return { subject, html, text };
}

// ============================================================
// 5. FAMILY INTRODUCTION (unsubscribable: bondMessages)
// ============================================================

export function familyIntroEmail(
  name: string,
  fromName: string,
  introducerName: string,
  unsubscribeUrl?: string,
): { subject: string; html: string; text: string } {
  const subject = `Family introduction from ${introducerName} — Tribes.app`;

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Family Introduction</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${name}</strong>, you've been introduced to <strong>${fromName}</strong> 
      through <strong>${introducerName}</strong>'s family network.
    </p>
    <div style="margin:16px 0;padding:16px;background-color:#f0fdf4;border-radius:8px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">👨‍👩‍👦</div>
      <p style="margin:0;font-size:16px;color:#166534;">
        You have a pending family bond request from <strong>${fromName}</strong>
      </p>
    </div>
    ${ctaButton('View Bond Request', '/bonds')}
  `,
    preheader: `${introducerName} introduced you to ${fromName} on Tribes.app.`,
    unsubscribeUrl,
  });

  const text = `Hi ${name}, you've been introduced to ${fromName} through ${introducerName}'s family network.\n\nLog in to accept the bond request.`;

  return { subject, html, text };
}

// ============================================================
// 6. EVENT REMINDER (unsubscribable: eventReminders)
// ============================================================

export function eventReminderEmail(
  name: string,
  eventName: string,
  dateStr: string,
  unsubscribeUrl?: string,
): { subject: string; html: string; text: string } {
  const subject = `Reminder: ${eventName} is coming up — Tribes.app`;

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Event Reminder</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${name}</strong>, just a reminder that you're attending an upcoming event:
    </p>
    <div style="margin:16px 0;padding:16px;background-color:#eff6ff;border-radius:8px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">📅</div>
      <p style="margin:0;font-size:18px;font-weight:600;color:#18181b;">${eventName}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#3b82f6;">${dateStr}</p>
    </div>
    ${ctaButton('View Event', '/events')}
  `,
    preheader: `Reminder: ${eventName} on ${dateStr}`,
    unsubscribeUrl,
  });

  const text = `Hi ${name}, reminder: ${eventName} on ${dateStr}.\n\nLog in to view event details.`;

  return { subject, html, text };
}
