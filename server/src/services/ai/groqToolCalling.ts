/**
 * Messign AI Brain — Groq Tool Calling Service
 *
 * Handles the LLM call to Groq with function calling (tools) enabled.
 * Used by the Intent Router and Agent Loop.
 * Uses fetch (no groq-sdk dependency).
 */

import type { ChatMessage, LLMRouterResponse, LLMToolDefinition, ParsedToolCall } from './types.js';
import type { StepTokenUsage } from './orchestrator/types.js';

const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const GROQ_SYNTHESIS_MODEL = 'llama-3.1-8b-instant';

export function getGroqApiKey(): string | null {
  return process.env.GROQ_API_KEY || null;
}

export interface GroqTrackedResponse extends LLMRouterResponse {
  usage: StepTokenUsage;
  rawToolCalls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/** OpenAI/Groq message format for multi-turn with tool calls */
export interface GroqMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: { name: string; arguments: string };
  }>;
}

/**
 * Send a query to Groq with tool definitions and get back either:
 * - Tool calls (the LLM wants to use specific tools)
 * - Direct content (conversational response)
 */
export async function callGroqWithTools(
  systemPrompt: string,
  userQuery: string,
  history: ChatMessage[],
  tools: LLMToolDefinition[]
): Promise<LLMRouterResponse> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq client not available (missing API key)');
  }

  const messages: { role: string; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];

  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }

  messages.push({ role: 'user', content: userQuery });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.1,
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }[];
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('No message in Groq response');
  }

  let toolCalls: ParsedToolCall[] | null = null;
  if (message.tool_calls && message.tool_calls.length > 0) {
    toolCalls = message.tool_calls.map((tc) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments || '{}') as Record<string, unknown>;
      } catch {
        console.warn(`[Groq Tool Calling] Failed to parse arguments for ${tc.function?.name}:`, tc.function?.arguments);
      }
      return {
        name: tc.function?.name || 'unknown',
        args: parsedArgs,
        callId: tc.id,
      };
    });
  }

  return {
    content: message.content || null,
    toolCalls,
  };
}

/**
 * Multi-turn Groq call with full message history (including assistant tool_calls and tool results).
 * Used by the agent loop for iterative tool calling.
 */
export async function callGroqWithToolsMultiTurn(
  messages: GroqMessage[],
  tools: LLMToolDefinition[]
): Promise<LLMRouterResponse> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq client not available (missing API key)');
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature: 0.2,
      max_tokens: 1024,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string; tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }[];
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('No message in Groq response');
  }

  let toolCalls: ParsedToolCall[] | null = null;
  if (message.tool_calls && message.tool_calls.length > 0) {
    toolCalls = message.tool_calls.map((tc) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        parsedArgs = JSON.parse(tc.function?.arguments || '{}') as Record<string, unknown>;
      } catch {
        console.warn(`[Groq Tool Calling] Failed to parse arguments for ${tc.function?.name}:`, tc.function?.arguments);
      }
      return {
        name: tc.function?.name || 'unknown',
        args: parsedArgs,
        callId: tc.id,
      };
    });
  }

  return {
    content: message.content || null,
    toolCalls,
  };
}

/**
 * Multi-turn Groq call that also returns token usage for budget tracking.
 * Used by the Phase 3 agentic orchestrator.
 */
export async function callGroqWithToolsMultiTurnTracked(
  messages: GroqMessage[],
  tools: LLMToolDefinition[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): Promise<GroqTrackedResponse> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq client not available (missing API key)');
  }

  const model = options?.model || GROQ_MODEL;
  const temperature = options?.temperature ?? 0.1;
  const maxTokens = options?.maxTokens ?? 1500;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      temperature,
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq API error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string; tool_calls?: Array<{ id?: string; type?: string; function?: { name?: string; arguments?: string } }> } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
  };

  const message = data.choices?.[0]?.message;
  if (!message) {
    throw new Error('No message in Groq response');
  }

  const usage: StepTokenUsage = {
    promptTokens: data.usage?.prompt_tokens ?? 0,
    completionTokens: data.usage?.completion_tokens ?? 0,
    totalTokens: (data.usage?.prompt_tokens ?? 0) + (data.usage?.completion_tokens ?? 0),
  };

  let toolCalls: ParsedToolCall[] | null = null;
  let rawToolCalls: GroqTrackedResponse['rawToolCalls'] | undefined;

  if (message.tool_calls && message.tool_calls.length > 0) {
    rawToolCalls = message.tool_calls.map((tc) => ({
      id: tc.id || `call_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: 'function' as const,
      function: {
        name: tc.function?.name || 'unknown',
        arguments: tc.function?.arguments || '{}',
      },
    }));

    toolCalls = rawToolCalls.map((tc) => {
      let parsedArgs: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(tc.function.arguments);
        parsedArgs = (parsed && typeof parsed === 'object') ? parsed as Record<string, unknown> : {};
      } catch {
        console.warn(`[Groq Tracked] Failed to parse arguments for ${tc.function.name}`);
      }
      return {
        name: tc.function.name,
        args: parsedArgs,
        callId: tc.id,
      };
    });
  }

  return {
    content: message.content || null,
    toolCalls,
    usage,
    rawToolCalls,
  };
}

/**
 * Streaming Groq completion for final synthesis (no tool calling).
 * Yields text chunks as they arrive via SSE.
 */
export async function* streamGroqCompletion(
  messages: GroqMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number }
): AsyncGenerator<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq client not available (missing API key)');
  }

  const model = options?.model || GROQ_SYNTHESIS_MODEL;
  const temperature = options?.temperature ?? 0.3;
  const maxTokens = options?.maxTokens ?? 2000;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq streaming error ${res.status}: ${errBody.slice(0, 200)}`);
  }

  if (!res.body) {
    throw new Error('No response body for streaming');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') return;

      try {
        const parsed = JSON.parse(jsonStr) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // skip malformed chunks
      }
    }
  }
}

/**
 * Web search using Groq's compound-beta model.
 * Streams text and includes web search context automatically.
 */
export async function* streamGroqWebSearch(
  query: string,
  systemContext: string,
  history: GroqMessage[],
): AsyncGenerator<string> {
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq client not available (missing API key)');
  }

  const messages: GroqMessage[] = [
    {
      role: 'system',
      content: systemContext,
    },
    ...history.slice(-4)
      .filter((h) => h.role === 'user' || h.role === 'assistant')
      .map((h) => ({ role: h.role as 'user' | 'assistant', content: h.content || '' })),
    { role: 'user', content: query },
  ];

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'compound-beta-mini',
      messages,
      temperature: 0.4,
      max_tokens: 2000,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Groq web search error ${res.status}: ${errBody.slice(0, 300)}`);
  }

  if (!res.body) throw new Error('No response body for web search streaming');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6);
      if (jsonStr === '[DONE]') return;

      try {
        const parsed = JSON.parse(jsonStr) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const content = parsed.choices?.[0]?.delta?.content;
        if (content) yield content;
      } catch {
        // skip malformed chunks
      }
    }
  }
}

/**
 * Fallback: Use Gemini for tool routing if Groq fails.
 */
export async function callGeminiWithTools(
  systemPrompt: string,
  userQuery: string,
  history: ChatMessage[],
  tools: LLMToolDefinition[]
): Promise<LLMRouterResponse> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not available');
  }

  const geminiTools = [{
    function_declarations: tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters,
    })),
  }];

  const contents: { role: string; parts: { text?: string }[] }[] = [];
  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user') {
      contents.push({ role: 'user', parts: [{ text: msg.content }] });
    } else if (msg.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }
  contents.push({ role: 'user', parts: [{ text: userQuery }] });

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools: geminiTools,
        tool_config: { function_calling_config: { mode: 'AUTO' } },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errorText}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: Array<{ functionCall?: { name?: string; args?: Record<string, unknown> }; text?: string }> } }[];
  };

  const candidate = data.candidates?.[0]?.content;
  if (!candidate) {
    throw new Error('No candidate in Gemini response');
  }

  let toolCalls: ParsedToolCall[] | null = null;
  let textContent: string | null = null;

  for (const part of candidate.parts || []) {
    if (part.functionCall) {
      if (!toolCalls) toolCalls = [];
      toolCalls.push({
        name: part.functionCall.name || 'unknown',
        args: part.functionCall.args || {},
      });
    }
    if (part.text) {
      textContent = part.text;
    }
  }

  return { content: textContent, toolCalls };
}
