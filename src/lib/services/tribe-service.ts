

/**
 * @fileoverview Service layer for tribe actions like creation and updates.
 */
import * as z from "zod";
import { tribesData, mockMembers, mockPendingMembers } from '@/lib/data';
import type { Tribe, TribeMember } from '@/lib/data';
import type { PendingMember as PendingMemberType, UserProfile } from '@/lib/types';


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
  minimumReputation: z.enum(['Excellent', 'Good', 'Fair', 'Poor', 'At Risk']).optional(),
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

// --- Member Management Services ---

export async function getTribeMembers(tribeId: string): Promise<TribeMember[]> {
  console.log(`Service: Fetching members for tribe ${tribeId}`);
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(mockMembers.filter(m => m.tribeId === tribeId));
    }, 250);
  });
}

export async function getPendingMembers(tribeId: string): Promise<PendingMemberType[]> {
  console.log(`Service: Fetching pending members for tribe ${tribeId}`);
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(mockPendingMembers.filter(p => p.tribeId === tribeId));
    }, 250);
  });
}

export async function updateMemberNickname(tribeId: string, memberId: string, nickname: string | undefined): Promise<void> {
    console.log(`Service: Updating nickname for member ${memberId} in tribe ${tribeId} to "${nickname}"`);
    return new Promise(resolve => {
        setTimeout(() => {
            const memberIndex = mockMembers.findIndex(m => m.id === memberId && m.tribeId === tribeId);
            if (memberIndex !== -1) {
                mockMembers[memberIndex].tribeAssignedNickname = nickname;
            }
            resolve();
        }, 300);
    });
}

export async function updateMemberRole(tribeId: string, memberId: string, role: 'member' | 'speaker'): Promise<void> {
    console.log(`Service: Updating role for member ${memberId} in tribe ${tribeId} to "${role}"`);
    return new Promise(resolve => {
        setTimeout(() => {
            const memberIndex = mockMembers.findIndex(m => m.id === memberId && m.tribeId === tribeId);
            if (memberIndex !== -1) {
                mockMembers[memberIndex].role = role;
            }
            resolve();
        }, 300);
    });
}

export async function approveJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
    console.log(`Service: Approving join request for ${pendingMemberId} in tribe ${tribeId}`);
    return new Promise(resolve => {
        setTimeout(() => {
            const pendingIndex = mockPendingMembers.findIndex(p => p.id === pendingMemberId && p.tribeId === tribeId);
            if (pendingIndex !== -1) {
                const [pendingMember] = mockPendingMembers.splice(pendingIndex, 1);
                const newMember: TribeMember = {
                    id: pendingMember.id,
                    name: pendingMember.name,
                    avatar: pendingMember.avatar,
                    dataAiHint: pendingMember.dataAiHint,
                    role: 'member',
                    tribeId: pendingMember.tribeId,
                };
                mockMembers.push(newMember);
            }
            resolve();
        }, 300);
    });
}

export async function denyJoinRequest(tribeId: string, pendingMemberId: string): Promise<void> {
    console.log(`Service: Denying join request for ${pendingMemberId} in tribe ${tribeId}`);
    return new Promise(resolve => {
        setTimeout(() => {
            const pendingIndex = mockPendingMembers.findIndex(p => p.id === pendingMemberId && p.tribeId === tribeId);
            if (pendingIndex !== -1) {
                mockPendingMembers.splice(pendingIndex, 1);
            }
            resolve();
        }, 300);
    });
}
