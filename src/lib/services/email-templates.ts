/**
 * @fileoverview Email Templates for Tribes (P4-1 + P4-2).
 * 
 * All templates use inline CSS (email-safe, no external stylesheets).
 * Each returns { subject, html, text } for use with sendEmail().
 * 
 * Templates:
 *   1. welcomeEmail         — Post-signup welcome
 *   2. verifyEmailTemplate  — Email verification link
 *   3. passKeyRecoveryEmail — Account recovery magic link
 *   4. bondRequestEmail     — New bond request notification
 *   5. innerCircleIntroEmail — Inner Circle introduction notification
 *   6. eventReminderEmail   — Upcoming event reminder
 *   7. tribePostEmail       — New tribe post notification
 */

// ============================================================
// SHARED LAYOUT
// ============================================================

// ============================================================
// SECURITY: HTML escape helper
// All user-supplied values interpolated into HTML must be escaped
// to prevent stored XSS via email clients that render HTML.
// ============================================================

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

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
  <title>Tribes</title>
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
              <div style="font-size:28px;font-weight:800;color:${BRAND_COLOR};letter-spacing:-0.5px;">Tribes</div>
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
              <p style="margin:0;">Tribes — Secure, local-first community platform</p>
              <p style="margin:4px 0 0;">You received this because you have an account on Tribes.</p>
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

function ctaButton(label: string, url: string, isNotification = false): string {
  // Ensure relative paths get the full base URL — email clients
  // interpret bare "/path" as a hostname, not a path.
  const baseUrl = process.env.APP_URL || 'https://tribes.app';

  // For notification emails, route through the click handler so it
  // stamps lastActivityViewedAt before redirecting to the destination.
  let fullUrl: string;
  if (isNotification) {
    const target = encodeURIComponent(url.startsWith('http') ? url : url);
    fullUrl = `${baseUrl}/api/notification/click?to=${target}`;
  } else {
    fullUrl = url.startsWith('http') ? url : `${baseUrl}${url}`;
  }

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td align="center" style="background:${BRAND_GRADIENT};border-radius:8px;">
        <a href="${fullUrl}" target="_blank" style="display:inline-block;padding:14px 32px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// ============================================================
// 1. WELCOME EMAIL (no unsubscribe — account lifecycle)
// ============================================================

export function welcomeEmail(name: string): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(name);
  const subject = `Welcome to Tribes, ${safeName}! 🎉`;

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Welcome to Tribes!</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hey <strong>${safeName}</strong>, you're in! Here's what you can do:
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
    preheader: `Welcome to Tribes! Here's what you can do.`,
  });

  const text = `Welcome to Tribes, ${name}!\n\nYou're in! Form bonds, join tribes, attend events, and build your reputation.\n\nYour data is local-first and your messages are E2E encrypted.`;

  return { subject, html, text };
}

// ============================================================
// 2. EMAIL VERIFICATION (no unsubscribe — account lifecycle)
// ============================================================

export function verifyEmailTemplate(name: string, verifyUrl: string): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(name);
  const subject = 'Verify your email — Tribes';

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Verify Your Email</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${safeName}</strong>, please verify your email address to help us keep your account secure.
    </p>
    ${ctaButton('Verify Email', verifyUrl)}
    <p style="margin:0;font-size:13px;color:#a1a1aa;line-height:1.5;">
      This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
    </p>
  `,
    preheader: `Verify your email to secure your Tribes account.`,
  });

  const text = `Hi ${name}, verify your email: ${verifyUrl}\n\nThis link expires in 24 hours.`;

  return { subject, html, text };
}

// ============================================================
// 3. PASSKEY RECOVERY (no unsubscribe — account lifecycle)
// ============================================================

export function passKeyRecoveryEmail(name: string, recoveryUrl: string): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(name);
  const subject = 'Account Recovery — Tribes';

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Account Recovery</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${safeName}</strong>, we received a request to recover your account.
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
    preheader: `Account recovery link for your Tribes account.`,
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
  const safeName = escapeHtml(name);
  const safeFromName = escapeHtml(fromName);
  const safeBondType = escapeHtml(bondType);
  const subject = `${safeFromName} wants to form a ${safeBondType} bond — Tribes`;

  const bondEmoji: Record<string, string> = {
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
      Hi <strong>${safeName}</strong>, you have a new bond request!
    </p>
    <div style="margin:16px 0;padding:16px;background-color:#f4f4f5;border-radius:8px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">${emoji}</div>
      <p style="margin:0;font-size:18px;font-weight:600;color:#18181b;">${safeFromName}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#71717a;">
        wants to form a <strong style="color:${BRAND_COLOR};">${safeBondType}</strong> bond with you
      </p>
    </div>
    ${ctaButton('View Bond Request', '/bonds', true)}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">
      Log in to accept or decline this request.
    </p>
  `,
    preheader: `${fromName} wants to form a ${bondType} bond with you.`,
    unsubscribeUrl,
  });

  const text = `Hi ${name}, ${fromName} wants to form a ${bondType} bond with you on Tribes.\n\nLog in to accept or decline.`;

  return { subject, html, text };
}

// ============================================================
// 5. INNER CIRCLE INTRODUCTION (unsubscribable: bondMessages)
// ============================================================


export function innerCircleIntroEmail(
  name: string,
  fromName: string,
  introducerName: string,
  unsubscribeUrl?: string,
): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(name);
  const safeFromName = escapeHtml(fromName);
  const safeIntroducerName = escapeHtml(introducerName);
  const subject = `Inner Circle introduction from ${safeIntroducerName} — Tribes`;

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Inner Circle Introduction</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${safeName}</strong>, you've been introduced to <strong>${safeFromName}</strong> 
      through <strong>${safeIntroducerName}</strong>'s Inner Circle.
    </p>
    <div style="margin:16px 0;padding:16px;background-color:#f0fdf4;border-radius:8px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">🤝</div>
      <p style="margin:0;font-size:16px;color:#166534;">
        You have a pending bond request from <strong>${safeFromName}</strong>
      </p>
    </div>
    ${ctaButton('View Bond Request', '/bonds', true)}
  `,
    preheader: `${introducerName} introduced you to ${fromName} on Tribes.`,
    unsubscribeUrl,
  });

  const text = `Hi ${name}, you've been introduced to ${fromName} through ${introducerName}'s Inner Circle.\n\nLog in to accept the bond request.`;

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
  const safeName = escapeHtml(name);
  const safeEventName = escapeHtml(eventName);
  const safeDateStr = escapeHtml(dateStr);
  const subject = `Reminder: ${safeEventName} is coming up — Tribes`;

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">Event Reminder</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${safeName}</strong>, just a reminder that you're attending an upcoming event:
    </p>
    <div style="margin:16px 0;padding:16px;background-color:#eff6ff;border-radius:8px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">📅</div>
      <p style="margin:0;font-size:18px;font-weight:600;color:#18181b;">${safeEventName}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#3b82f6;">${safeDateStr}</p>
    </div>
    ${ctaButton('View Event', '/events', true)}
  `,
    preheader: `Reminder: ${eventName} on ${dateStr}`,
    unsubscribeUrl,
  });

  const text = `Hi ${name}, reminder: ${eventName} on ${dateStr}.\n\nLog in to view event details.`;

  return { subject, html, text };
}

// ============================================================
// 7. TRIBE POST NOTIFICATION (unsubscribable: tribeActivity)
// ============================================================

export function tribePostEmail(
  name: string,
  authorName: string,
  tribeName: string,
  unsubscribeUrl?: string,
  tribeId?: string,
  postId?: string,
  postSlug?: string | null,
  tribeSlug?: string | null,
): { subject: string; html: string; text: string } {
  const safeName = escapeHtml(name);
  const safeAuthorName = escapeHtml(authorName);
  const safeTribeName = escapeHtml(tribeName);
  const subject = `New post in ${safeTribeName} — Tribes`;

  // Build canonical post URL: /t/{tribeSlug}/{slug} or /p/{slug} if available,
  // otherwise /post/{id} (the app's 308 redirect will normalize).
  let postUrl = '/your-comms';
  if (postId) {
    if (tribeSlug && postSlug) {
      postUrl = `/t/${tribeSlug}/${postSlug}`;
    } else if (postSlug) {
      postUrl = `/p/${postSlug}`;
    } else {
      postUrl = `/post/${postId}`;
    }
  } else if (tribeId) {
    postUrl = `/tribes/${tribeId}`;
  }

  const html = emailLayout({
    content: `
    <h1 style="margin:0 0 16px;font-size:24px;font-weight:700;color:#18181b;">New Tribe Post</h1>
    <p style="margin:0 0 16px;font-size:16px;color:#3f3f46;line-height:1.6;">
      Hi <strong>${safeName}</strong>, there's new activity in your tribe!
    </p>
    <div style="margin:16px 0;padding:16px;background-color:#eef2ff;border-radius:8px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">📝</div>
      <p style="margin:0;font-size:18px;font-weight:600;color:#18181b;">${safeTribeName}</p>
      <p style="margin:4px 0 0;font-size:14px;color:#6366f1;">
        <strong>${safeAuthorName}</strong> shared a new post
      </p>
    </div>
    ${ctaButton('View Post', postUrl, true)}
    <p style="margin:0;font-size:13px;color:#a1a1aa;">
      Log in to see the full post and join the conversation.
    </p>
  `,
    preheader: `${authorName} posted in ${tribeName}.`,
    unsubscribeUrl,
  });

  const text = `Hi ${name}, ${authorName} posted in ${tribeName}.\n\nLog in to view the post.`;

  return { subject, html, text };
}
