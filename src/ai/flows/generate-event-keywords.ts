'use server';

/**
 * @fileOverview Generates suggested keywords for an event.
 */

import { chatCompletion } from '@/lib/ai-client';
import { z } from 'zod';

export interface GenerateEventKeywordsInput {
  eventName: string;
  eventDescription: string;
}

export interface GenerateEventKeywordsOutput {
  suggestedKeywords: string[];
}

const KeywordResponseSchema = z.object({
  suggestedKeywords: z.array(z.string()).default([]),
});

export async function generateEventKeywords(
  input: GenerateEventKeywordsInput
): Promise<GenerateEventKeywordsOutput> {
  const prompt = `Event Name: ${input.eventName}
Event Description: ${input.eventDescription}

Based on these event details, suggest 5-7 relevant and diverse keywords. Consider the event type, main topics, atmosphere, and target audience.

Return ONLY a JSON object with a single key "suggestedKeywords" containing an array of strings. Example:
{"suggestedKeywords": ["Live Music", "Outdoor", "Family Friendly", "Food Trucks", "Summer Festival"]}`;

  const response = await chatCompletion({
    system: 'You are an expert event marketing assistant. Return only valid JSON.',
    prompt,
    temperature: 0.7,
    jsonMode: true,
  });

  try {
    const parsed = JSON.parse(response);
    const validated = KeywordResponseSchema.safeParse(parsed);
    if (validated.success) return validated.data;
    return { suggestedKeywords: [] };
  } catch {
    // Fallback: try to extract keywords from plain text
    return { suggestedKeywords: [] };
  }
}
