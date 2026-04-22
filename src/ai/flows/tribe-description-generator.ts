'use server';

/**
 * @fileOverview Generates a compelling description for a tribe based on moods and a homepage URL.
 */

import { chatCompletion } from '@/lib/ai-client';
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface GenerateTribeDescriptionInput {
  name: string;
  moods: string;
  homepageUrl?: string;
}

export interface GenerateTribeDescriptionOutput {
  description: string;
}

async function fetchOpenGraphData(url: string): Promise<string> {
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Error fetching URL ${url}:`, message);
    return "Could not fetch data from the provided URL.";
  }
}

export async function generateTribeDescription(
  input: GenerateTribeDescriptionInput
): Promise<GenerateTribeDescriptionOutput> {
  let websiteContext = '';
  if (input.homepageUrl) {
    websiteContext = await fetchOpenGraphData(input.homepageUrl);
  }

  const prompt = `Tribe Name: ${input.name}
Moods: ${input.moods}${websiteContext ? `\n\nWebsite Info:\n${websiteContext}` : ''}

Generate a compelling tribe description that:
- Naturally includes the tribe name
- Captures the vibe of the specified moods
${websiteContext ? '- Uses the website information as primary context for the description' : ''}
- Is 2-3 sentences long`;

  const response = await chatCompletion({
    system: 'You are a marketing expert. Generate a compelling tribe description. Return only the description text, no formatting or quotes.',
    prompt,
    temperature: 0.8,
  });

  return { description: response };
}
