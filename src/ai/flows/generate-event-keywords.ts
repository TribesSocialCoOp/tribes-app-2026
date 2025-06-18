
'use server';

/**
 * @fileOverview Generates suggested keywords for an event.
 *
 * - generateEventKeywords - A function that generates suggested event keywords.
 * - GenerateEventKeywordsInput - The input type for the generateEventKeywords function.
 * - GenerateEventKeywordsOutput - The return type for the generateEventKeywords function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateEventKeywordsInputSchema = z.object({
  eventName: z
    .string()
    .describe('The name of the event.'),
  eventDescription: z
    .string()
    .describe('The detailed description of the event.'),
});
export type GenerateEventKeywordsInput = z.infer<
  typeof GenerateEventKeywordsInputSchema
>;

const GenerateEventKeywordsOutputSchema = z.object({
  suggestedKeywords: z
    .array(z.string())
    .describe('A list of 5-7 suggested keywords for the event.'),
});
export type GenerateEventKeywordsOutput = z.infer<
  typeof GenerateEventKeywordsOutputSchema
>;

export async function generateEventKeywords(
  input: GenerateEventKeywordsInput
): Promise<GenerateEventKeywordsOutput> {
  return generateEventKeywordsFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateEventKeywordsPrompt',
  input: {schema: GenerateEventKeywordsInputSchema},
  output: {schema: GenerateEventKeywordsOutputSchema},
  prompt: `You are an expert event marketing assistant. Based on the following event details, suggest a list of 5-7 relevant and diverse keywords. These keywords should help categorize the event and make it discoverable. Consider the event type, main topics, atmosphere, and target audience.

Event Name: {{{eventName}}}
Event Description: {{{eventDescription}}}

Return the keywords as a JSON array of strings. For example: ["Live Music", "Outdoor", "Family Friendly", "Food Trucks", "Summer Festival"]`,
});

const generateEventKeywordsFlow = ai.defineFlow(
  {
    name: 'generateEventKeywordsFlow',
    inputSchema: GenerateEventKeywordsInputSchema,
    outputSchema: GenerateEventKeywordsOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
