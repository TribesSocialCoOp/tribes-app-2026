/**
 * POST /api/cron/disk-alert — Receive disk space alerts from server cron.
 *
 * Called by scripts/server-maintenance.sh when disk usage exceeds thresholds.
 * Sends an email to the admin address with the alert details.
 *
 * Protected by the shared CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { sendEmail } from '@/lib/services/email-service';

/** Escape HTML special characters to prevent injection in email templates. */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ADMIN_EMAIL = 'dustin@tribes.app';

interface DiskAlertPayload {
  level: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  message: string;
  disk_usage: number;
  disk_avail: string;
  hostname?: string;
  server_ip?: string;
}

export async function POST(request: NextRequest) {
  // Authenticate via shared secret
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('Authorization');

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const payload: DiskAlertPayload = await request.json();
    const { level, disk_usage } = payload;

    // Sanitize all string fields before interpolating into HTML
    const message = escapeHtml(payload.message ?? '');
    const disk_avail = escapeHtml(payload.disk_avail ?? 'unknown');
    const hostname = escapeHtml(payload.hostname ?? 'tribes-prod');
    const server_ip = escapeHtml(payload.server_ip ?? 'unknown');

    const emoji = level === 'EMERGENCY' ? '🚨' : level === 'CRITICAL' ? '🔴' : '⚠️';
    const subject = `${emoji} Tribes.app Disk ${level}: ${disk_usage}% used`;

    await sendEmail({
      to: ADMIN_EMAIL,
      subject,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: ${level === 'EMERGENCY' ? '#dc2626' : level === 'CRITICAL' ? '#ea580c' : '#ca8a04'}; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
            <h2 style="margin: 0;">${emoji} Disk Space ${level}</h2>
          </div>
          <div style="background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 0 0 8px 8px;">
            <p style="font-size: 16px; margin-top: 0;">${message}</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px 0; color: #a0a0a0;">Disk Usage</td>
                <td style="padding: 8px 0; text-align: right; font-weight: bold; color: ${disk_usage >= 85 ? '#ef4444' : '#f59e0b'};">${disk_usage}%</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a0a0a0;">Available</td>
                <td style="padding: 8px 0; text-align: right;">${disk_avail}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a0a0a0;">Server</td>
                <td style="padding: 8px 0; text-align: right;">${hostname} (${server_ip})</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #a0a0a0;">Time (UTC)</td>
                <td style="padding: 8px 0; text-align: right;">${new Date().toISOString()}</td>
              </tr>
            </table>
            <p style="color: #a0a0a0; font-size: 13px; margin-bottom: 0;">
               This alert was sent by the server maintenance cron job.<br>
               Alert cooldown: 6 hours between repeat alerts.
            </p>
          </div>
        </div>
      `,
      text: `Tribes.app Disk ${level}\n\n${message}\n\nDisk Usage: ${disk_usage}%\nAvailable: ${disk_avail}\nServer: ${hostname} (${server_ip})\nTime: ${new Date().toISOString()}`,
    });

    console.log(`[disk-alert] ${level}: ${disk_usage}% used, ${disk_avail} free`);
    return NextResponse.json({ sent: true, level, disk_usage });
  } catch (err) {
    console.error('[disk-alert] Failed to send alert:', err);
    return NextResponse.json({ error: 'Alert failed' }, { status: 500 });
  }
}
