'use server';
/**
 * @fileOverview A helpful AI assistant for the Tribes.app.
 *
 * - askAssistant - A function that handles chat interactions.
 * - AssistantInput - The input type for the askAssistant function.
 * - AssistantOutput - The return type for the askAssistant function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';
import { tribesData } from '@/lib/data'; // To look up tribe info

// Define input schema for the flow
const AssistantInputSchema = z.object({
  message: z.string(),
  history: z.array(
    z.object({
      role: z.enum(['user', 'model']),
      parts: z.array(z.object({text: z.string()})),
    })
  ),
});
export type AssistantInput = z.infer<typeof AssistantInputSchema>;

// Define output schema for the flow (simple string response)
const AssistantOutputSchema = z.string();
export type AssistantOutput = z.infer<typeof AssistantOutputSchema>;

// Define a tool to get information about a specific tribe.
// This is privacy-preserving as it only accesses public data.
const getTribeInfo = ai.defineTool(
  {
    name: 'getTribeInfo',
    description: 'Get public information about a specific tribe, like its description and number of members.',
    inputSchema: z.object({
      tribeName: z.string().describe('The name of the tribe to look up.'),
    }),
    outputSchema: z.string(),
  },
  async ({tribeName}) => {
    const tribe = tribesData.find(t => t.name.toLowerCase() === tribeName.toLowerCase());
    if (tribe) {
      return `Tribe '${tribe.name}' is a ${tribe.isPublic ? 'public' : 'private'} tribe with ${tribe.members} members. Its description is: "${tribe.description}"`;
    }
    return `I could not find a tribe named '${tribeName}'.`;
  }
);

// Define a tool for general help questions about the app.
// This ensures controlled and accurate answers for how-to questions.
const getGeneralHelp = ai.defineTool(
  {
    name: 'getGeneralHelp',
    description: 'Provides help on how to use features of the Tribes.app.',
    inputSchema: z.object({
      topic: z
        .enum(['create_tribe', 'create_event', 'find_moods', 'manage_bonds'])
        .describe('The specific topic the user needs help with.'),
    }),
    outputSchema: z.string(),
  },
  async ({topic}) => {
    switch (topic) {
      case 'create_tribe':
        return "To create a new tribe, go to the 'Tribes' page from the main sidebar and click the 'Create New Tribe' button. You'll be asked to provide a name, description, associated moods, and an optional cover image.";
      case 'create_event':
        return "To create an event, navigate to the 'Events' page and click 'Create New Event'. You will need to provide details like the event name, description, date, location, and the organizing tribe.";
      case 'find_moods':
        return "You can explore Mood Streams by clicking on 'Moods' in the sidebar. This will show you different content streams based on moods like 'Chill', 'Focus', or 'Create'. You can also tune your 'Intercom' feed to see highlights from specific moods.";
      case 'manage_bonds':
        return "The 'Bonds' page allows you to manage all your connections. You can see users and tribes you are connected to, refresh your passkeys, set aliases for your connections, and even manage special 'Family' bonds.";
      default:
        return 'I can help with creating tribes, creating events, finding moods, or managing bonds. What would you like to know?';
    }
  }
);


// Define the main prompt for the assistant
const assistantPrompt = ai.definePrompt({
  name: 'assistantPrompt',
  system: `You are a friendly and helpful AI assistant for an application called Tribes.app.
Your goal is to assist users with their questions about the app.
Be concise and clear in your responses.
Use the tools provided to answer questions about specific tribes or how to use the app's features.
If you don't know the answer, say so politely. Do not make up information.`,
  tools: [getTribeInfo, getGeneralHelp],
});


// Define the main flow that orchestrates the chat logic
const assistantFlow = ai.defineFlow(
  {
    name: 'assistantFlow',
    inputSchema: AssistantInputSchema,
    outputSchema: AssistantOutputSchema,
  },
  async ({message, history}) => {
    const llmResponse = await assistantPrompt({
        history,
        prompt: message,
    });
    return llmResponse.text;
  }
);


// Exported wrapper function to be called from the frontend.
export async function askAssistant(
  input: AssistantInput
): Promise<AssistantOutput> {
  return await assistantFlow(input);
}
