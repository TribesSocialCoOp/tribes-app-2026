'use server';

/**
 * @fileOverview Summarizes recent tribe activity for a user.
 */

import { chatCompletion } from '@/lib/ai-client';

export interface SummarizeTribeActivityInput {
  tribeName: string;
  recentActivity: string;
}

export interface SummarizeTribeActivityOutput {
  summary: string;
}

export async function summarizeTribeActivity(
  input: SummarizeTribeActivityInput
): Promise<SummarizeTribeActivityOutput> {
  const prompt = `Summarize the following recent activity within the tribe named "${input.tribeName}":

${input.recentActivity}

Provide a concise summary of the key discussions and shared files so the user can quickly understand what's happening.`;

  const response = await chatCompletion({
    system: 'You are an AI assistant helping a user catch up on tribe activity. Be concise and informative. Return only the summary text.',
    prompt,
    temperature: 0.5,
  });

  return { summary: response };
}
