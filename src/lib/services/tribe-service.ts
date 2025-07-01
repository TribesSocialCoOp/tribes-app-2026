
/**
 * @fileoverview Service layer for tribe actions like creation and updates.
 */
import * as z from "zod";
import { tribesData } from '@/lib/data';
import type { Tribe } from '@/lib/data';

// From create/page.tsx
const createTribeFormSchema = z.object({
  name: z.string().min(3).max(50),
  homepageUrl: z.string().url().optional().or(z.literal('')),
  moods: z.array(z.string()).min(1).max(3),
  description: z.string().min(10).max(500),
  isPublic: z.boolean(),
  coverImage: z.any().optional(),
});
type CreateTribePayload = z.infer<typeof createTribeFormSchema> & { coverPreview?: string | null };

/**
 * Simulates creating a new tribe.
 */
export async function createTribe(payload: CreateTribePayload): Promise<Tribe> {
  console.log("Service: Creating tribe", payload);
  
  const newTribe: Tribe = {
    id: `tribe-${Date.now()}`,
    name: payload.name,
    description: payload.description,
    members: 1, // Starts with the creator
    isPublic: payload.isPublic,
    cover: payload.coverPreview || `https://placehold.co/400x200.png?text=${encodeURIComponent(payload.name.substring(0,10))}`,
    dataAiHint: "community group",
    moods: payload.moods,
    homepageUrl: payload.homepageUrl || undefined,
    joinMechanism: 'instant', // Default for new tribes
  };

  return new Promise(resolve => {
    setTimeout(() => {
      tribesData.unshift(newTribe);
      resolve(newTribe);
    }, 500);
  });
}


// From settings/page.tsx
const tribeSettingsFormSchema = z.object({
  name: z.string().min(3).max(50),
  description: z.string().min(10).max(500),
  homepageUrl: z.string().url().optional().or(z.literal('')),
  isPublic: z.boolean(),
  moods: z.array(z.string()).max(3).optional().default([]),
  joinMechanism: z.enum(['instant', 'approval']),
});
type UpdateTribeSettingsPayload = z.infer<typeof tribeSettingsFormSchema>;


/**
 * Simulates updating tribe settings.
 */
export async function updateTribeSettings(tribeId: string, payload: UpdateTribeSettingsPayload): Promise<Tribe | null> {
    console.log(`Service: Updating settings for tribe ${tribeId}`, payload);
    
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            const tribeIndex = tribesData.findIndex(t => t.id === tribeId);
            if (tribeIndex !== -1) {
                tribesData[tribeIndex] = { ...tribesData[tribeIndex], ...payload };
                resolve(tribesData[tribeIndex]);
            } else {
                reject(new Error("Tribe not found"));
            }
        }, 500);
    });
}

    