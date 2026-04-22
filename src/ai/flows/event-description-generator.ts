'use server';

/**
 * @fileOverview Generates a compelling description for an event.
 */

import { chatCompletion } from '@/lib/ai-client';

export interface GenerateEventDescriptionInput {
  name: string;
  keywords: string;
  locationName: string;
  locationCityRegion: string;
}

export interface GenerateEventDescriptionOutput {
  description: string;
}

export async function generateEventDescription(
  input: GenerateEventDescriptionInput
): Promise<GenerateEventDescriptionOutput> {
  const prompt = `Event Name: ${input.name}
Event Keywords: ${input.keywords}
Event Venue/Location: ${input.locationName}
Event City/Region: ${input.locationCityRegion}

The description should:
- Be enthusiastic and make people want to attend.
- Clearly convey the essence of the event based on the name, keywords, and location.
- If the location is not "Online", subtly weave in the location to enhance the local feel.
- Highlight what makes the event special or unique.
- Be approximately 2-4 sentences long.`;

  const response = await chatCompletion({
    system: 'You are an expert event marketing copywriter. Generate a compelling and engaging event description. Return only the description text, no formatting or quotes.',
    prompt,
    temperature: 0.8,
  });

  return { description: response };
}
