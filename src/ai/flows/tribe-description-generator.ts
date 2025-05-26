
// TribeDescriptionGenerator.ts
'use server';

/**
 * @fileOverview Generates a compelling description for a tribe based on moods.
 *
 * - generateTribeDescription - A function that generates the tribe description.
 * - GenerateTribeDescriptionInput - The input type for the generateTribeDescription function.
 * - GenerateTribeDescriptionOutput - The return type for the generateTribeDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const GenerateTribeDescriptionInputSchema = z.object({
  moods: z // Renamed from keywords
    .string()
    .describe('Comma separated moods describing the tribe and its purpose (e.g., Chill Vibes, Productive Focus, Creative Spark).'),
});
export type GenerateTribeDescriptionInput = z.infer<
  typeof GenerateTribeDescriptionInputSchema
>;

const GenerateTribeDescriptionOutputSchema = z.object({
  description: z
    .string()
    .describe('A compelling description of the tribe based on the moods.'),
});
export type GenerateTribeDescriptionOutput = z.infer<
  typeof GenerateTribeDescriptionOutputSchema
>;

export async function generateTribeDescription(
  input: GenerateTribeDescriptionInput
): Promise<GenerateTribeDescriptionOutput> {
  return generateTribeDescriptionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateTribeDescriptionPrompt',
  input: {schema: GenerateTribeDescriptionInputSchema},
  output: {schema: GenerateTribeDescriptionOutputSchema},
  prompt: `You are a marketing expert. Generate a compelling description for a tribe based on the following moods: {{{moods}}}. The description should be engaging, reflect the essence of these moods, and attract new members.`,
});

const generateTribeDescriptionFlow = ai.defineFlow(
  {
    name: 'generateTribeDescriptionFlow',
    inputSchema: GenerateTribeDescriptionInputSchema,
    outputSchema: GenerateTribeDescriptionOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);

    