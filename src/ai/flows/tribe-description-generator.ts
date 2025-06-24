// TribeDescriptionGenerator.ts
'use server';

/**
 * @fileOverview Generates a compelling description for a tribe based on moods and a homepage URL.
 *
 * - generateTribeDescription - A function that generates the tribe description.
 * - GenerateTribeDescriptionInput - The input type for the generateTribeDescription function.
 * - GenerateTribeDescriptionOutput - The return type for the generateTribeDescription function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import axios from 'axios';
import * as cheerio from 'cheerio';

const GenerateTribeDescriptionInputSchema = z.object({
  name: z.string().describe('The name of the tribe.'),
  moods: z
    .string()
    .describe('Comma separated moods describing the tribe and its purpose (e.g., Chill Vibes, Productive Focus, Creative Spark).'),
  homepageUrl: z.string().url().optional().describe('The optional homepage URL for the tribe to get more context from.'),
});
export type GenerateTribeDescriptionInput = z.infer<
  typeof GenerateTribeDescriptionInputSchema
>;

const GenerateTribeDescriptionOutputSchema = z.object({
  description: z
    .string()
    .describe('A compelling description of the tribe based on the moods and website content.'),
});
export type GenerateTribeDescriptionOutput = z.infer<
  typeof GenerateTribeDescriptionOutputSchema
>;

const fetchOpenGraphData = ai.defineTool(
  {
    name: 'fetchOpenGraphData',
    description: 'Fetches OpenGraph data (og:title, og:description) from a given URL to understand the website\'s content.',
    inputSchema: z.object({ url: z.string().url() }),
    outputSchema: z.string(),
  },
  async ({ url }) => {
    try {
      const { data: html } = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'
        }
      });
      const $ = cheerio.load(html);
      
      const title = $('meta[property="og:title"]').attr('content') || $('title').text() || 'No title found';
      const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || 'No description found';

      return `Website Content:\n- Title: ${title}\n- Description: ${description}`;
    } catch (error: any) {
      console.error(`Error fetching URL ${url}:`, error.message);
      return "Could not fetch data from the provided URL. It might be down or blocking requests.";
    }
  }
);

export async function generateTribeDescription(
  input: GenerateTribeDescriptionInput
): Promise<GenerateTribeDescriptionOutput> {
  return generateTribeDescriptionFlow(input);
}

const prompt = ai.definePrompt({
  name: 'generateTribeDescriptionPrompt',
  input: {schema: GenerateTribeDescriptionInputSchema},
  output: {schema: GenerateTribeDescriptionOutputSchema},
  tools: [fetchOpenGraphData],
  system: `You are a marketing expert. Your task is to generate a compelling tribe description.
If a homepageUrl is provided in the input, you MUST use the fetchOpenGraphData tool to get information from that URL.
Use the fetched website information as the primary source for the description's content and tone.
Then, creatively weave in the provided moods to capture the tribe's vibe.
Always include the provided tribe name naturally in the final description.
If the tool fails to fetch data, generate the description using only the name and moods.`,
  prompt: `Tribe Name: {{{name}}}\nMoods: {{{moods}}}{{#if homepageUrl}}\nHomepage URL: {{{homepageUrl}}}{{/if}}`,
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
