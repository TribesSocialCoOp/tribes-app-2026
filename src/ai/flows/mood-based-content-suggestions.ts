'use server';

/**
 * @fileOverview AI agent that suggests relevant threads based on mood.
 */

import { chatCompletion } from '@/lib/ai-client';
import { z } from 'zod';

export interface MoodBasedContentSuggestionsInput {
  currentMood: string;
  tribeThreads: string[];
  userInterests: string[];
}

export interface MoodBasedContentSuggestionsOutput {
  suggestedThreads: string[];
  reasoning: string;
}

const MoodResponseSchema = z.object({
  suggestedThreads: z.array(z.string()).default([]),
  reasoning: z.string().default(''),
});

export async function suggestThreadsForMood(
  input: MoodBasedContentSuggestionsInput
): Promise<MoodBasedContentSuggestionsOutput> {
  const threadList = input.tribeThreads.map(t => `- ${t}`).join('\n');
  const interests = input.userInterests.join(', ');

  const prompt = `Current Mood: ${input.currentMood}
User Interests: ${interests}

Tribe Threads:
${threadList}

Based on the user's current mood and interests, suggest 3 threads from the tribe that would be most relevant. Provide a brief explanation of why these threads were suggested.

Return ONLY a JSON object with keys "suggestedThreads" (array of thread titles) and "reasoning" (string). Example:
{"suggestedThreads": ["Thread A", "Thread B", "Thread C"], "reasoning": "These threads match because..."}`;

  const response = await chatCompletion({
    system: 'You are an AI assistant designed to suggest relevant threads from a tribe to a user based on their current mood and interests. Return only valid JSON.',
    prompt,
    temperature: 0.7,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response);
    const validated = MoodResponseSchema.safeParse(parsed);
    if (validated.success) return validated.data;
    return { suggestedThreads: [], reasoning: 'Unable to generate suggestions at this time.' };
  } catch {
    return { suggestedThreads: [], reasoning: 'Unable to generate suggestions at this time.' };
  }
}
