/**
 * @fileoverview Event Reminder Cron Endpoint (P4-2).
 * 
 * GET /api/cron/event-reminders
 * 
 * Protected by CRON_SECRET bearer token.
 * Queries events happening in the next 24–25 hours, finds RSVP'd users,
 * checks their email preferences, and sends reminders.
 * Uses reminderSentAt on event_rsvps to avoid duplicates.
 * 
 * External trigger:
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://app.tribes.app/api/cron/event-reminders
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db';
import { events, eventRsvps, users, notificationPreferences } from '@/db/schema';
import { eq, and, isNull, gte, lte, inArray } from 'drizzle-orm';
import { sendEmail } from '@/lib/services/email-service';
import { eventReminderEmail } from '@/lib/services/email-templates';
import { generateUnsubscribeUrl } from '@/lib/services/email-unsubscribe-service';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  // ── Auth check ──────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  const isDev = process.env.NODE_ENV !== 'production';

  // In dev, allow without secret for testing
  if (!isDev) {
    if (!cronSecret) {
      return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 });
    }

    const authHeader = request.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (token !== cronSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  // ── Find events in the 24–25h window ────────────────────────
  const now = new Date();
  const windowStart = new Date(now.getTime() + 23 * 60 * 60 * 1000); // 23h from now
  const windowEnd = new Date(now.getTime() + 25 * 60 * 60 * 1000);   // 25h from now

  const upcomingEvents = await db.select().from(events)
    .where(and(
      gte(events.eventDate, windowStart),
      lte(events.eventDate, windowEnd),
    ));

  if (upcomingEvents.length === 0) {
    return NextResponse.json({ reminded: 0, skipped: 0, events: 0, message: 'No events in reminder window' });
  }

  let reminded = 0;
  let skipped = 0;

  for (const event of upcomingEvents) {
    // Get RSVPs that haven't been reminded yet
    const rsvps = await db.select().from(eventRsvps)
      .where(and(
        eq(eventRsvps.eventId, event.id),
        inArray(eventRsvps.status, ['going', 'interested']),
        isNull(eventRsvps.reminderSentAt),
      ));

    for (const rsvp of rsvps) {
      try {
        // Check user prefs
        const [prefs] = await db.select().from(notificationPreferences)
          .where(eq(notificationPreferences.userId, rsvp.userId)).limit(1);

        // Default to enabled if no prefs row exists
        const emailEnabled = prefs?.emailEnabled ?? true;
        const pushEnabled = prefs?.pushEnabled ?? true;
        const eventRemindersEnabled = prefs?.eventRemindersEnabled ?? true;

        if (!eventRemindersEnabled || (!emailEnabled && !pushEnabled)) {
          skipped++;
          // Still mark as sent to avoid re-checking on next run
          await db.update(eventRsvps)
            .set({ reminderSentAt: new Date() })
            .where(eq(eventRsvps.id, rsvp.id));
          continue;
        }

        // Get user details
        const [user] = await db.select({ name: users.name, email: users.email })
          .from(users).where(eq(users.id, rsvp.userId)).limit(1);

        if (!user) {
          skipped++;
          await db.update(eventRsvps)
            .set({ reminderSentAt: new Date() })
            .where(eq(eventRsvps.id, rsvp.id));
          continue;
        }

        // Format the date
        const dateStr = event.eventDate
          ? event.eventDate.toLocaleDateString('en-US', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
              hour: 'numeric', minute: '2-digit',
            })
          : 'Soon';

        // Send push notification (fire-and-forget)
        if (pushEnabled) {
          const { sendPushNotification } = await import('@/lib/services/push-service');
          sendPushNotification(rsvp.userId, {
            title: `Reminder: ${event.name}`,
            body: `Your event is coming up on ${dateStr}`,
            url: `/events`,
            tag: `event-reminder-${event.id}`,
          }).catch(() => {});
        }

        // Send email reminder
        if (emailEnabled && user.email) {
          const unsubUrl = generateUnsubscribeUrl(rsvp.userId, 'eventReminders');
          const email = eventReminderEmail(user.name, event.name, dateStr, unsubUrl);
          await sendEmail({ to: user.email, ...email }, rsvp.userId);
        }

        // Mark as reminded
        await db.update(eventRsvps)
          .set({ reminderSentAt: new Date() })
          .where(eq(eventRsvps.id, rsvp.id));

        reminded++;
      } catch (err) {
        console.error(`[cron/event-reminders] Error sending to RSVP ${rsvp.id}:`, err);
        skipped++;
      }
    }
  }

  return NextResponse.json({
    reminded,
    skipped,
    events: upcomingEvents.length,
    timestamp: now.toISOString(),
  });
}
