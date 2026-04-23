/**
 * @fileoverview Email Transactional Service (P4-1).
 * 
 * Dual-mode architecture:
 * - DEV: Writes emails to a local JSON file for inspection via /admin/mailbox
 * - PROD: Sends via Nodemailer (targeting SES SMTP)
 * 
 * Environment variables (PROD only):
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// ============================================================
// TYPES
// ============================================================

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface DevMailboxEntry extends EmailMessage {
  sentAt: string;
  id: string;
}

// ============================================================
// CONFIGURATION
// ============================================================

const isDev = process.env.NODE_ENV !== 'production';
const DEV_MAILBOX_PATH = path.join(process.cwd(), 'src', 'db', 'dev-mailbox.json');

function getSmtpConfig() {
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const isImplicitTls = port === 465;
  const pass = process.env.SMTP_PASS ?? '';

  return {
    host: process.env.SMTP_HOST ?? '',
    port,
    // Port 465 = implicit TLS (connect encrypted from the start)
    // Port 587 = STARTTLS (upgrade plaintext → TLS after EHLO)
    secure: isImplicitTls,
    // Only include auth if credentials are provided.
    // Google Workspace SMTP relay supports IP-only auth (no password needed).
    ...(pass ? { auth: { user: process.env.SMTP_USER ?? '', pass } } : {}),
    // Enforce TLS on port 587 — refuse to send if STARTTLS fails
    requireTLS: !isImplicitTls,
    tls: {
      // Reject self-signed or invalid certificates
      rejectUnauthorized: true,
      // Minimum TLS 1.2 — block TLS 1.0/1.1
      minVersion: 'TLSv1.2' as const,
    },
  };
}

function getFromAddress(): string {
  return process.env.EMAIL_FROM ?? '"Tribes.app" <noreply@tribes.app>';
}

// ============================================================
// CORE SEND FUNCTION
// ============================================================

/**
 * Sends a transactional email.
 * In DEV, logs to a JSON file. In PROD, sends via Nodemailer SMTP.
 * If userId is provided, checks the user's notification preferences
 * and skips the email if they have opted out.
 */
export async function sendEmail(message: EmailMessage, userId?: string): Promise<void> {
  // Honour user email opt-out
  if (userId) {
    try {
      const { getPreferences } = await import('./notification-service');
      const prefs = await getPreferences(userId);
      if (!prefs.emailEnabled) {
        console.log(`[email] Skipped — user ${userId} opted out of emails`);
        return;
      }
    } catch {
      // Preferences not loadable — send anyway (fail open)
    }
  }

  if (isDev) {
    await devLogEmail(message);
    return;
  }

  // PROD: Use Nodemailer
  const config = getSmtpConfig();
  if (!config.host) {
    console.warn('[email] SMTP not configured — skipping email to:', message.to);
    return;
  }

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.createTransport(config);

    await transporter.sendMail({
      from: getFromAddress(),
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text ?? stripHtml(message.html),
    });
  } catch (err) {
    console.error('[email] Failed to send:', err);
    // Don't throw — emails are fire-and-forget
  }
}

// ============================================================
// DEV MAILBOX
// ============================================================

async function devLogEmail(message: EmailMessage): Promise<void> {
  const entry: DevMailboxEntry = {
    ...message,
    sentAt: new Date().toISOString(),
    id: crypto.randomUUID(),
  };

  const mailbox = await getDevMailbox();
  mailbox.unshift(entry); // newest first

  // Keep max 100 entries
  const trimmed = mailbox.slice(0, 100);

  const dir = path.dirname(DEV_MAILBOX_PATH);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  await writeFile(DEV_MAILBOX_PATH, JSON.stringify(trimmed, null, 2), 'utf-8');

  console.log(`[email-dev] 📧 → ${message.to}: "${message.subject}"`);
}

/**
 * Reads all dev mailbox entries (DEV only).
 */
export async function getDevMailbox(): Promise<DevMailboxEntry[]> {
  try {
    if (!existsSync(DEV_MAILBOX_PATH)) return [];
    const raw = await readFile(DEV_MAILBOX_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Clears the dev mailbox (DEV only).
 */
export async function clearDevMailbox(): Promise<void> {
  if (existsSync(DEV_MAILBOX_PATH)) {
    await writeFile(DEV_MAILBOX_PATH, '[]', 'utf-8');
  }
}

// ============================================================
// UTILITY
// ============================================================

/**
 * Rough HTML-to-text conversion for the text fallback.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
