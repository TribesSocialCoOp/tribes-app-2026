'use server';

import { requireAuth, getCurrentUserId, trackContribution } from './shared';
import type { Event } from '@/lib/types';
import { rsvpLimiter } from '@/lib/auth/rate-limit';

// ======== EVENT SERVICE ========
export async function getEvents(): Promise<Event[]> {
  const { getEvents: fn } = await import('@/lib/services/event-service');
  return fn();
}

export async function getEventById(eventId: string): Promise<Event | null> {
  const { getEventById: fn } = await import('@/lib/services/event-service');
  return fn(eventId);
}

export async function getEventsForTribe(tribeName: string): Promise<Event[]> {
  // SECURITY: Private tribes should not expose their events to non-members.
  // findTribeByName respects the viewer's membership — returns null if private
  // and the caller is not a member.
  const userId = await getCurrentUserId();
  const { findTribeByName } = await import('@/lib/data-access/tribes');
  const tribe = await findTribeByName(tribeName, userId);
  if (!tribe) return []; // Tribe not found or caller has no access

  const { getEventsForTribe: fn } = await import('@/lib/services/event-service');
  return fn(tribeName);
}

export async function createEvent(payload: Parameters<typeof import('@/lib/services/event-service').createEvent>[0]): Promise<Event> {
  const userId = await requireAuth();
  const { createEvent: fn } = await import('@/lib/services/event-service');
  const result = await fn({ ...payload, creatorId: userId });
  trackContribution(userId, 'event_hosted', result.id, `Hosted event: ${result.name}`);
  return result;
}

// ======== EVENT RSVP ========
export async function rsvpToEvent(eventId: string, status: 'going' | 'interested' | 'not_going'): Promise<{ status: string; rsvpCount: number; pointsAwarded: number }> {
  const userId = await requireAuth();
  await rsvpLimiter.check(userId);
  const { rsvpToEvent: fn } = await import('@/lib/services/event-service');
  const result = await fn(eventId, userId, status);
  if (result.pointsAwarded > 0) {
    trackContribution(userId, 'event_rsvp', eventId, `RSVP to event (+${result.pointsAwarded} reward pts)`);
  }
  return result;
}

export async function getEventRsvpCount(eventId: string): Promise<number> {
  const { getEventRsvpCount: fn } = await import('@/lib/services/event-service');
  return fn(eventId);
}

export async function getUserRsvpStatus(eventId: string): Promise<'going' | 'interested' | 'not_going' | null> {
  const userId = await getCurrentUserId();
  if (!userId) return null;
  const { getUserRsvpStatus: fn } = await import('@/lib/services/event-service');
  return fn(eventId, userId);
}

export async function getEventAttendeesPreview(eventId: string) {
  const { getEventAttendeesPreview: fn } = await import('@/lib/services/event-service');
  return fn(eventId);
}

// ======== EVENT STREAM POSTS ========
export async function getEventStreamPosts(eventId: string) {
  const { getEventStreamPosts: fn } = await import('@/lib/services/event-service');
  return fn(eventId);
}

export async function createEventStreamPost(eventId: string, nickname: string, content: string) {
  const userId = await requireAuth();
  const { createEventStreamPost: fn } = await import('@/lib/services/event-service');
  return fn(eventId, userId, nickname, content);
}

export async function getMaxRsvpPoints(): Promise<{ max: number; reputation: number }> {
  const userId = await getCurrentUserId();
  if (!userId) return { max: 10, reputation: 0 };
  const { getMaxRsvpPoints: fn } = await import('@/lib/services/event-service');
  return fn(userId);
}
