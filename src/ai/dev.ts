
import { config } from 'dotenv';
config();

import '@/ai/flows/tribe-description-generator.ts';
import '@/ai/flows/mood-based-content-suggestions.ts';
import '@/ai/flows/summarize-tribe-activity.ts';
import '@/ai/flows/event-description-generator.ts';
import '@/ai/flows/generate-event-keywords.ts'; // Added new flow for keywords
    
