/**
 * Messign AI Brain — External AI Cascade
 *
 * Tries providers in order (Groq → Gemini → Anthropic) with per-provider timeouts.
 * On timeout or failure, fails over to the next provider.
 */

import { streamGroqAnswer, getGroqApiKey } from '../knowledgeGroq.js';
import { streamGeminiAnswer, getGeminiApiKey } from '../knowledgeGemini.js';
import { recordSuccess, recordFailure, getAvailableProviders } from './circuitBreaker.js';
import { getSynthesisProviderOrder } from './taskRouter.js';

const CASCADE_TIMEOUT_MS = 20_000;

export interface StreamCascadeOptions {
  userQuery: string;
  trimmedContext: string;
  systemPrompt: string;
  userMessage: string;
  chatHistory?: { role: 'user' | 'assistant'; content: string }[];
  concise?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}

export interface StreamCascadeResult {
  provider: string;
}

/**
 * Stream synthesis through the cascade: Groq → Gemini → Anthropic.
 * Tries each provider with timeout; on timeout or failure, tries next.
 */
export async function streamWithCascade(
  onChunk: (text: string) => void,
  options: StreamCascadeOptions
): Promise<StreamCascadeResult | null> {
  const timeoutMs = options.timeoutMs ?? CASCADE_TIMEOUT_MS;
  const available = new Set(getAvailableProviders());
  const preferred = getSynthesisProviderOrder();
  const providers = preferred.filter(p => available.has(p));
  if (providers.length === 0) {
    return null;
  }

  for (const provider of providers) {
    try {
      await runWithTimeout(
        () => tryProvider(provider, onChunk, options),
        timeoutMs,
        provider
      );
      recordSuccess(provider);
      return { provider };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[AI Cascade] ${provider} failed:`, msg);
      recordFailure(provider, msg);
    }
  }
  return null;
}

function runWithTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
  provider: string
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`[AI Cascade] ${provider} timed out after ${ms}ms`));
    }, ms);
    fn()
      .then((r) => {
        clearTimeout(timer);
        resolve(r);
      })
      .catch((e) => {
        clearTimeout(timer);
        reject(e);
      });
  });
}

async function tryProvider(
  provider: string,
  onChunk: (text: string) => void,
  opts: StreamCascadeOptions
): Promise<void> {
  if (provider === 'groq' && getGroqApiKey()) {
    await streamGroqAnswer(
      opts.userQuery,
      opts.trimmedContext,
      onChunk,
      opts.chatHistory,
      {
        concise: opts.concise,
        maxTokens: opts.maxTokens,
        systemPrompt: opts.systemPrompt,
        userMessage: opts.userMessage,
      }
    );
    return;
  }

  if (provider === 'gemini' && getGeminiApiKey()) {
    await streamGeminiAnswer(
      opts.userQuery,
      opts.trimmedContext,
      onChunk,
      {
        systemPrompt: opts.systemPrompt,
        userMessage: opts.userMessage,
      }
    );
    return;
  }

  if (provider === 'anthropic' && process.env.ANTHROPIC_API_KEY) {
    await streamAnthropicToCallback(
      opts.userQuery,
      opts.systemPrompt + '\n\n---\n\n' + opts.trimmedContext,
      process.env.ANTHROPIC_API_KEY,
      onChunk
    );
    return;
  }

  throw new Error(`Provider ${provider} not configured or unavailable`);
}

async function streamAnthropicToCallback(
  userQuery: string,
  context: string,
  apiKey: string,
  onChunk: (text: string) => void
): Promise<void> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      stream: true,
      messages: [{
        role: 'user',
        content: `Answer the following question using the provided context. Cite sources by document title. If the context doesn't fully answer the question, say so.\n\nContext:\n${context}\n\nQuestion: ${userQuery}`,
      }],
    }),
  });

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6)) as { type?: string; delta?: { text?: string } };
          if (event.type === 'content_block_delta' && event.delta?.text) {
            onChunk(event.delta.text);
          }
        } catch {
          /* skip parse errors */
        }
      }
    }
  }
}
