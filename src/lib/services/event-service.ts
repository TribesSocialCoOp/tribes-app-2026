/**
 * @fileoverview Service layer for event actions.
 */
import * as z from "zod";
import { sampleEventsData } from '@/lib/data';
import type { Event } from '@/lib/types';


const eventCreateFormSchema = z.object({
  name: z.string(),
  keywords: z.string(),
  description: z.string(),
  eventDate: z.date(),
  associatedTribe: z.string(),
  locationName: z.string(),
  locationCityRegion: z.string(),
  coverImage: z.any().optional(), // simplified for service
  isPublic: z.boolean(),
});

// We accept the form values, plus the local `coverPreview` state
type EventCreatePayload = z.infer<typeof eventCreateFormSchema> & { coverPreview?: string | null };

/**
 * Simulates creating a new event.
 * In a real app, this would be a server action that writes to the database.
 * @param payload The data for the new event.
 * @returns A promise that resolves to the newly created event object.
 */
export async function createEvent(payload: EventCreatePayload): Promise<Event> {
  console.log("Service: Creating event", payload);

  const newEvent: Event = {
    id: `event-${Date.now()}`,
    name: payload.name,
    description: payload.description,
    keywords: payload.keywords,
    eventDate: payload.eventDate,
    associatedTribe: payload.associatedTribe,
    locationName: payload.locationName,
    locationCityRegion: payload.locationCityRegion,
    isPublic: payload.isPublic,
    creatorId: 'currentUser', // Mock current user ID
    coverImage: payload.coverPreview || `https://placehold.co/1200x400.png?text=${encodeURIComponent(payload.name.substring(0,15))}`,
    dataAiHintCover: 'event banner',
  };

  return new Promise(resolve => {
    setTimeout(() => {
      sampleEventsData.unshift(newEvent);
      resolve(newEvent);
    }, 500);
  });
}
