'use server';

/**
 * @fileOverview A helpful AI assistant for the Tribes.app, referred to as T-Codex Prime.
 *
 * - askAssistant - A function that handles chat interactions.
 * - AssistantInput - The input type for the askAssistant function.
 * - AssistantOutput - The return type for the askAssistant function.
 */

import { chatCompletion, type ChatMessage } from '@/lib/ai-client';
import { findTribeByName } from '@/lib/data-access/tribes';

export interface AssistantInput {
  message: string;
  history: {
    role: 'user' | 'model';
    parts: { text: string }[];
  }[];
}

export type AssistantOutput = string;

// General help lookup — no LLM needed for these
function getGeneralHelp(topic: string): string {
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

/**
 * Handles chat interactions with the AI assistant.
 */
export async function askAssistant(input: AssistantInput): Promise<AssistantOutput> {
  // Convert Genkit-style history to OpenAI chat messages
  const messages: ChatMessage[] = input.history.map(h => ({
    role: h.role === 'model' ? 'assistant' as const : 'user' as const,
    content: h.parts.map(p => p.text).join(''),
  }));

  // Build context: try to resolve any tribe names mentioned
  let tribeContext = '';
  const tribeNameMatch = input.message.match(/(?:about|tribe|called)\s+(?:the\s+)?["']?([^"'?.!]+)["']?/i);
  if (tribeNameMatch) {
    const tribe = await findTribeByName(tribeNameMatch[1].trim());
    if (tribe) {
      tribeContext = `\n\n[Context: Tribe '${tribe.name}' is a ${tribe.isPublic ? 'public' : 'private'} tribe with ${tribe.members} members. Description: "${tribe.description}"]`;
    }
  }

  // Check for help topics
  const helpTopics = ['create_tribe', 'create_event', 'find_moods', 'manage_bonds'];
  const helpKeywords: Record<string, string[]> = {
    create_tribe: ['create', 'new tribe', 'start a tribe', 'make a tribe'],
    create_event: ['create event', 'new event', 'make an event', 'start an event'],
    find_moods: ['mood', 'moods', 'stream', 'intercom'],
    manage_bonds: ['bond', 'bonds', 'connection', 'passkey'],
  };

  let helpContext = '';
  const lowerMessage = input.message.toLowerCase();
  for (const topic of helpTopics) {
    if (helpKeywords[topic].some(kw => lowerMessage.includes(kw))) {
      helpContext += `\n\n[Help info: ${getGeneralHelp(topic)}]`;
    }
  }

  const response = await chatCompletion({
    system: `You are a friendly and helpful AI assistant for an application called Tribes.app.
Your goal is to assist users with their questions about the app.
Be concise and clear in your responses.
If context about a tribe or help information is provided below, use it to answer accurately.
If you don't know the answer, say so politely. Do not make up information.${tribeContext}${helpContext}`,
    messages,
    prompt: input.message,
  });

  return response;
}
