'use server';

/**
 * @fileoverview Provider-neutral AI client using OpenAI-compatible API.
 * Works with vLLM, Ollama, llama.cpp, LiteLLM, or any OpenAI-compatible endpoint.
 *
 * Configure via environment variables (defaults):
 *   AI_BASE_URL  - The base URL of your inference server (default: http://localhost:8000/v1)
 *   AI_API_KEY   - API key if required (default: not-needed)
 *   AI_MODEL     - Model identifier (default: default)
 *
 * All three can be overridden at runtime from Admin → AI Settings,
 * persisted to the `app_settings` DB table.
 */

import OpenAI from 'openai';

const ENV_BASE_URL = process.env.AI_BASE_URL || 'http://localhost:8000/v1';
const ENV_API_KEY = process.env.AI_API_KEY || 'not-needed';
const ENV_MODEL = process.env.AI_MODEL || 'default';

// ============================================================
// DB-backed setting helpers
// ============================================================

async function getSetting(key: string): Promise<string | null> {
  try {
    const { db } = await import('@/db');
    const { appSettings } = await import('@/db/schema');
    const { eq } = await import('drizzle-orm');
    const rows = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const { db } = await import('@/db');
  const { appSettings } = await import('@/db/schema');
  const { eq } = await import('drizzle-orm');
  const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).limit(1);
  if (existing.length > 0) {
    await db.update(appSettings).set({ value, updatedAt: new Date() }).where(eq(appSettings.key, key));
  } else {
    await db.insert(appSettings).values({ key, value, updatedAt: new Date() });
  }
}

// ============================================================
// Active config resolution (DB override → env → fallback)
// ============================================================

async function getActiveEndpoint(): Promise<string> {
  return (await getSetting('ai_endpoint')) || ENV_BASE_URL;
}

async function getActiveApiKey(): Promise<string> {
  return (await getSetting('ai_api_key')) || ENV_API_KEY;
}

async function getActiveModel(): Promise<string> {
  return (await getSetting('ai_model')) || ENV_MODEL;
}

// ============================================================
// Chat Completion
// ============================================================

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export async function chatCompletion(options: {
  system?: string;
  messages?: ChatMessage[];
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}): Promise<string> {
  const baseUrl = await getActiveEndpoint();
  const apiKey = await getActiveApiKey();
  const model = await getActiveModel();

  const client = new OpenAI({ baseURL: baseUrl, apiKey });
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (options.system) {
    messages.push({ role: 'system', content: options.system });
  }
  if (options.messages) {
    for (const msg of options.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: options.prompt });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 1024,
      ...(options.jsonMode ? { response_format: { type: 'json_object' } } : {}),
    });
    return response.choices[0]?.message?.content ?? '';
  } catch (error: unknown) {
    const errObj = error as { status?: number; response?: { status?: number }; message?: string };
    const status = errObj?.status || errObj?.response?.status;
    const msg = errObj?.message || 'Unknown error';

    if (status === 404) {
      return `⚠️ AI model "${model}" was not found on the inference server. An administrator can update the active model from **Admin → AI Settings**.`;
    }
    if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('ENOTFOUND') || msg.includes('ECONNRESET')) {
      return `⚠️ Cannot reach the AI server at \`${baseUrl}\`. Please ensure your inference server is running, or ask an admin to update the endpoint in **Admin → AI Settings**.`;
    }
    if (status === 401 || status === 403) {
      return `⚠️ AI authentication failed. Please check your API key configuration.`;
    }

    console.error('[ai-client] Chat completion error:', error);
    return `⚠️ AI service error: ${msg}. Please try again later or contact an administrator.`;
  }
}

// ============================================================
// ADMIN: Model Discovery & Configuration
// ============================================================

export interface DiscoveredModel {
  id: string;
  contextLength?: number;
}

export interface DiscoveryResult {
  models: DiscoveredModel[];
  endpoint: string;
  error?: string;
  /** 'warming_up' = server is loading model (ECONNRESET), long retry.
   *  'connection_down' = nothing listening (ECONNREFUSED/ETIMEDOUT), short retry then hard error. */
  retryKind?: 'warming_up' | 'connection_down';
}

/**
 * Discover available models from a given endpoint.
 * Queries /v1/models (OpenAI/vLLM) then /api/tags (Ollama).
 * Accepts an optional custom endpoint so the admin can test before saving.
 */
export async function discoverModels(customEndpoint?: string): Promise<DiscoveryResult> {
  const rawEndpoint = customEndpoint || (await getActiveEndpoint());
  const base = rawEndpoint.replace(/\/v1\/?$/, '').replace(/\/$/, '');
  const apiKey = await getActiveApiKey();

  try {
    let serverReachable = false;

    // Try OpenAI format first (/v1/models)
    const oaiUrl = `${base}/v1/models`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey && apiKey !== 'not-needed') {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    const response = await fetch(oaiUrl, {
      headers,
      signal: AbortSignal.timeout(10000),
    });

    if (response.ok) {
      serverReachable = true;
      const data = await response.json();
      // Ollama returns { data: null } when no models are loaded; vLLM returns { data: [...] }
      const modelList = Array.isArray(data?.data) ? data.data : [];
      if (modelList.length > 0) {
        const models: DiscoveredModel[] = modelList.map((m: { id: string; max_model_len?: number }) => ({
          id: m.id,
          contextLength: m.max_model_len || undefined,
        }));
        models.sort((a, b) => a.id.localeCompare(b.id));
        return { models, endpoint: base };
      }
    }

    // Try Ollama native format (/api/tags)
    const ollamaUrl = `${base}/api/tags`;
    const ollamaResponse = await fetch(ollamaUrl, {
      signal: AbortSignal.timeout(10000),
    });

    if (ollamaResponse.ok) {
      serverReachable = true;
      const ollamaData = await ollamaResponse.json();
      const modelList = Array.isArray(ollamaData?.models) ? ollamaData.models : [];
      if (modelList.length > 0) {
        const models: DiscoveredModel[] = modelList.map((m: { name?: string; model?: string }) => ({
          id: m.name || m.model || 'unknown',
        }));
        models.sort((a, b) => a.id.localeCompare(b.id));
        return { models, endpoint: base };
      }
    }

    // Server responded but no models available
    if (serverReachable) {
      return { models: [], endpoint: base, error: `Server at ${base} is running but has no models loaded. Pull a model first (e.g. "ollama pull llama3.2").` };
    }

    return { models: [], endpoint: base, error: `Server at ${base} responded but returned unexpected data.` };
  } catch (error: unknown) {
    const errObj = error as { cause?: { code?: string; message?: string }; message?: string; name?: string };
    const causeCode = errObj?.cause?.code || '';
    const causeMsg = errObj?.cause?.message || errObj?.message || 'Unknown network error';

    if (causeCode === 'ECONNRESET') {
      return { models: [], endpoint: base, retryKind: 'warming_up', error: `Server at ${base} accepted connection but reset — model weights are still loading.` };
    }
    if (causeCode === 'ECONNREFUSED') {
      return { models: [], endpoint: base, retryKind: 'connection_down', error: `No server is listening at ${base}. Verify the URL and that your inference server is running.` };
    }
    if (causeCode === 'ENOTFOUND') {
      return { models: [], endpoint: base, error: `Host not found: ${base}. Check the endpoint URL.` };
    }
    if (causeCode === 'ETIMEDOUT' || errObj?.name === 'TimeoutError') {
      return { models: [], endpoint: base, retryKind: 'connection_down', error: `Request to ${base} timed out. The server may not be reachable.` };
    }

    return { models: [], endpoint: base, error: `${causeMsg} (${causeCode || 'unknown'})` };
  }
}

// ============================================================
// Admin getters & setters
// ============================================================

export async function getAiConfig(): Promise<{
  endpoint: string;
  apiKey: string;
  activeModel: string;
  envEndpoint: string;
  envApiKey: string;
  envModel: string;
}> {
  return {
    endpoint: await getActiveEndpoint(),
    apiKey: await getActiveApiKey(),
    activeModel: await getActiveModel(),
    envEndpoint: ENV_BASE_URL,
    envApiKey: ENV_API_KEY,
    envModel: ENV_MODEL,
  };
}

export async function saveAiConfig(config: {
  endpoint?: string;
  apiKey?: string;
  model?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    if (config.endpoint !== undefined) await upsertSetting('ai_endpoint', config.endpoint);
    if (config.apiKey !== undefined) await upsertSetting('ai_api_key', config.apiKey);
    if (config.model !== undefined) await upsertSetting('ai_model', config.model);
    return { success: true };
  } catch (error: unknown) {
    console.error('[ai-client] Failed to save config:', error);
    return { success: false, error: ((error instanceof Error) ? error.message : 'An error occurred') };
  }
}

export async function resetAiConfig(): Promise<{ success: boolean; error?: string }> {
  try {
    const { db } = await import('@/db');
    const { appSettings } = await import('@/db/schema');
    const { inArray } = await import('drizzle-orm');
    await db.delete(appSettings).where(inArray(appSettings.key, ['ai_endpoint', 'ai_api_key', 'ai_model']));
    return { success: true };
  } catch (error: unknown) {
    return { success: false, error: ((error instanceof Error) ? error.message : 'An error occurred') };
  }
}
