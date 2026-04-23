/**
 * @fileoverview Notification / activity feed service.
 * Aggregates activity across existing tables — no new writes needed.
 * Respects user notification preferences.
 */

import { db } from '@/db';
import {
  notificationPreferences,
  bondRequests,
  messages,
  bonds,
  pendingMembers,
  tribeMembers,
  tribes,
  users,
  mentions,
} from '@/db/schema';
import { eq, and, isNull, ne, desc, sql } from 'drizzle-orm';

// ============================================================
// TYPES
// ============================================================

export interface ActivityItem {
  id: string;
  type: 'bond_request' | 'unread_message' | 'tribe_join_request' | 'mention' | 'system';
  title: string;
  description: string;
  timestamp: Date;
  actionUrl?: string;
  read: boolean;
}

export interface NotificationPrefs {
  pushEnabled: boolean;
  emailEnabled: boolean;
  mentionsEnabled: boolean;
  bondMessagesEnabled: boolean;
  tribeActivityEnabled: boolean;
  eventRemindersEnabled: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  pushEnabled: true,
  emailEnabled: true,
  mentionsEnabled: true,
  bondMessagesEnabled: true,
  tribeActivityEnabled: true,
  eventRemindersEnabled: true,
};

// ============================================================
// PREFERENCES
// ============================================================

export async function getPreferences(userId: string): Promise<NotificationPrefs> {
  const [row] = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (!row) return DEFAULT_PREFS;

  return {
    pushEnabled: row.pushEnabled ?? true,
    emailEnabled: row.emailEnabled ?? true,
    mentionsEnabled: row.mentionsEnabled ?? true,
    bondMessagesEnabled: row.bondMessagesEnabled ?? true,
    tribeActivityEnabled: row.tribeActivityEnabled ?? true,
    eventRemindersEnabled: row.eventRemindersEnabled ?? true,
  };
}

export async function savePreferences(
  userId: string,
  prefs: Partial<NotificationPrefs>,
): Promise<void> {
  const existing = await db.select().from(notificationPreferences)
    .where(eq(notificationPreferences.userId, userId))
    .limit(1);

  if (existing.length > 0) {
    await db.update(notificationPreferences)
      .set({ ...prefs, updatedAt: new Date() })
      .where(eq(notificationPreferences.userId, userId));
  } else {
    await db.insert(notificationPreferences).values({
      userId,
      ...prefs,
      updatedAt: new Date(),
    });
  }
}

// ============================================================
// ACTIVITY FEED
// ============================================================

/**
 * Aggregates recent activity for a user from existing tables.
 * Returns newest items first, max 30 items.
 */
export async function getActivityFeed(userId: string): Promise<ActivityItem[]> {
  const prefs = await getPreferences(userId);
  const items: ActivityItem[] = [];

  // 1. Pending bond requests TO this user
  const pendingBondReqs = await db.select({
    id: bondRequests.id,
    fromUserId: bondRequests.fromUserId,
    bondType: bondRequests.bondType,
    createdAt: bondRequests.createdAt,
    message: bondRequests.message,
  }).from(bondRequests)
    .where(and(
      eq(bondRequests.toUserId, userId),
      eq(bondRequests.status, 'pending'),
    ))
    .orderBy(desc(bondRequests.createdAt))
    .limit(10);

  for (const req of pendingBondReqs) {
    // Look up sender name
    const [sender] = await db.select({ name: users.name })
      .from(users).where(eq(users.id, req.fromUserId)).limit(1);

    items.push({
      id: `activity-bond-${req.id}`,
      type: 'bond_request',
      title: 'New Bond Request',
      description: `${sender?.name ?? 'Someone'} wants to form a ${req.bondType} bond${req.message ? `: "${req.message}"` : ''}`,
      timestamp: req.createdAt ?? new Date(),
      actionUrl: '/bonds',
      read: false,
    });
  }

  // 2. Unread messages (if bond messages enabled)
  if (prefs.bondMessagesEnabled) {
    const userBonds = await db.select({ id: bonds.id, targetName: bonds.targetName })
      .from(bonds)
      .where(eq(bonds.userId, userId));

    for (const bond of userBonds) {
      const [unread] = await db.select({
        count: sql<number>`count(*)`,
      }).from(messages)
        .where(and(
          eq(messages.bondId, bond.id),
          ne(messages.senderId, userId),
          isNull(messages.readAt),
        ));

      const count = unread?.count ?? 0;
      if (count > 0) {
        items.push({
          id: `activity-msg-${bond.id}`,
          type: 'unread_message',
          title: `${count} unread message${count > 1 ? 's' : ''}`,
          description: `from ${bond.targetName}`,
          timestamp: new Date(), // approximate
          actionUrl: `/bonds/${bond.id}`,
          read: false,
        });
      }
    }
  }

  // 3. Tribe join requests (if user is admin/speaker of any tribe)
  if (prefs.tribeActivityEnabled) {
    const adminMemberships = await db.select({ tribeId: tribeMembers.tribeId })
      .from(tribeMembers)
      .where(and(
        eq(tribeMembers.userId, userId),
        eq(tribeMembers.role, 'admin'),
      ));

    for (const membership of adminMemberships) {
      const pending = await db.select({
        id: pendingMembers.id,
        usrId: pendingMembers.userId,
        requestedAt: pendingMembers.requestedAt,
      }).from(pendingMembers)
        .where(eq(pendingMembers.tribeId, membership.tribeId))
        .limit(5);

      const [tribe] = await db.select({ name: tribes.name })
        .from(tribes).where(eq(tribes.id, membership.tribeId)).limit(1);

      for (const p of pending) {
        const [applicant] = await db.select({ name: users.name })
          .from(users).where(eq(users.id, p.usrId)).limit(1);

        items.push({
          id: `activity-join-${p.id}`,
          type: 'tribe_join_request',
          title: 'Tribe Join Request',
          description: `${applicant?.name ?? 'Someone'} wants to join ${tribe?.name ?? 'your tribe'}`,
          timestamp: p.requestedAt ?? new Date(),
          actionUrl: `/tribes/${membership.tribeId}/manage-members`,
          read: false,
        });
      }
    }
  }

  // 4. Unread mentions (if mentions enabled)
  if (prefs.mentionsEnabled) {
    const mentionRows = await db.select({
      id: mentions.id,
      sourceType: mentions.sourceType,
      mentionerUserId: mentions.mentionerUserId,
      createdAt: mentions.createdAt,
      read: mentions.read,
    }).from(mentions)
      .where(and(
        eq(mentions.mentionedUserId, userId),
        eq(mentions.read, false),
      ))
      .orderBy(desc(mentions.createdAt))
      .limit(10);

    for (const m of mentionRows) {
      const [mentioner] = await db.select({ name: users.name })
        .from(users).where(eq(users.id, m.mentionerUserId)).limit(1);

      items.push({
        id: `activity-mention-${m.id}`,
        type: 'mention',
        title: 'You were mentioned',
        description: `${mentioner?.name ?? 'Someone'} mentioned you in a ${m.sourceType?.replace('_', ' ') ?? 'post'}`,
        timestamp: m.createdAt ?? new Date(),
        actionUrl: '/your-comms',
        read: false,
      });
    }
  }

  // Sort all items by timestamp desc
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return items.slice(0, 30);
}

/**
 * Gets total unread activity count for sidebar badge.
 */
export async function getUnreadActivityCount(userId: string): Promise<number> {
  const feed = await getActivityFeed(userId);
  return feed.filter(item => !item.read).length;
}
