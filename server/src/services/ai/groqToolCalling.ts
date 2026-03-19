/**
 * Messign AI Brain — Groq Tool Calling Service
 *
 * PRIMARY: Uses LiteLLM gateway (callModel) for cost tracking and routing.
 * FALLBACK: Direct Groq/Gemini/Claude when LiteLLM is unavailable.
 */

import type OpenAI from 'openai';
import type { ChatMessage, LLMRouterResponse, LLMToolDefinition, ParsedToolCall } from './types.js';
import type { StepTokenUsage } from './orchestrator/types.js';
import { callModelSafe } from './gateway.js';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROQ_SYNTHESIS_MODEL = 'llama-3.3-70b-versatile';

const FALLBACK_WARNING = '[AI Gateway] LiteLLM unavailable, using direct fallback. Cost tracking disabled for this request.';

export function getGroqApiKey(): string | null {
  return process.env.GROQ_API_KEY || null;
}

function toOpenAITools(tools: LLMToolDefinition[]): OpenAI.ChatCompletionTool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.function.name,
      description: t.function.description,
      parameters: t.function.parameters as unknown as OpenAI.FunctionParameters,
    },
  }));
}

function parseGatewayToolCalls(choices: { message?: { tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }> } }[]): ParsedToolCall[] | null {
  const toolCalls = choices?.[0]?.message?.tool_calls;
  if (!toolCalls?.length) return null;
  return toolCalls.map((tc) => {
    let args: Record<string, unknown> = {};
    try {
      args = JSON.parse(tc.function?.arguments || '{}') as Record<string, unknown>;
    } catch {
      // ignore
    }
    return {
      name: tc.function?.name || 'unknown',
      args,
      callId: tc.id,
    };
  });
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
 * Send a query with tool definitions. Tries LiteLLM gateway first, then direct APIs.
 */
export async function callGroqWithTools(
  systemPrompt: string,
  userQuery: string,
  history: ChatMessage[],
  tools: LLMToolDefinition[],
  tenantId: string = 'system',
): Promise<LLMRouterResponse> {
  const messages: { role: 'system' | 'user' | 'assistant'; content: string }[] = [
    { role: 'system', content: systemPrompt },
  ];
  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userQuery });

  const tiers: Array<'fast' | 'balanced' | 'complex'> = ['fast', 'balanced', 'complex'];
  for (const tier of tiers) {
    try {
      const response = await callModelSafe({
        tier,
        messages,
        tools: tools.length > 0 ? toOpenAITools(tools) : undefined,
        tenantId,
        maxTokens: 512,
        temperature: 0.1,
      });
      const choice = response.choices?.[0]?.message;
      const toolCalls = parseGatewayToolCalls(response.choices ?? []);
      return {
        content: choice?.content ?? null,
        toolCalls: toolCalls ?? null,
      };
    } catch {
      continue;
    }
  }

  console.warn(FALLBACK_WARNING);
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
      disable_tool_validation: tools.length > 0,
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
 * Multi-turn call with full message history. Tries LiteLLM gateway first.
 */
export async function callGroqWithToolsMultiTurn(
  messages: GroqMessage[],
  tools: LLMToolDefinition[],
  tenantId: string = 'system',
): Promise<LLMRouterResponse> {
  const openAIMessages = messages.map((m) => {
    if (m.role === 'tool' && m.tool_call_id) {
      return { role: 'tool' as const, content: m.content ?? '', tool_call_id: m.tool_call_id };
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return {
        role: 'assistant' as const,
        content: m.content ?? null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content ?? '' };
  }) as OpenAI.ChatCompletionMessageParam[];

  const tiers: Array<'fast' | 'balanced' | 'complex'> = ['fast', 'balanced', 'complex'];
  for (const tier of tiers) {
    try {
      const response = await callModelSafe({
        tier,
        messages: openAIMessages,
        tools: tools.length > 0 ? toOpenAITools(tools) : undefined,
        tenantId,
        maxTokens: 1024,
        temperature: 0.2,
      });
      const choice = response.choices?.[0]?.message;
      const toolCalls = parseGatewayToolCalls(response.choices ?? []);
      return {
        content: choice?.content ?? null,
        toolCalls: toolCalls ?? null,
      };
    } catch {
      continue;
    }
  }

  console.warn(FALLBACK_WARNING);
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
      disable_tool_validation: tools.length > 0,
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
 * Multi-turn call with token usage. Tries LiteLLM gateway first.
 */
export async function callGroqWithToolsMultiTurnTracked(
  messages: GroqMessage[],
  tools: LLMToolDefinition[],
  options?: { model?: string; temperature?: number; maxTokens?: number; tenantId?: string },
): Promise<GroqTrackedResponse> {
  const tenantId = options?.tenantId ?? 'system';
  const openAIMessages = messages.map((m) => {
    if (m.role === 'tool' && m.tool_call_id) {
      return { role: 'tool' as const, content: m.content ?? '', tool_call_id: m.tool_call_id };
    }
    if (m.role === 'assistant' && m.tool_calls) {
      return {
        role: 'assistant' as const,
        content: m.content ?? null,
        tool_calls: m.tool_calls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.function.name, arguments: tc.function.arguments },
        })),
      };
    }
    return { role: m.role, content: m.content ?? '' };
  }) as OpenAI.ChatCompletionMessageParam[];

  const tiers: Array<'fast' | 'balanced' | 'complex'> = ['fast', 'balanced', 'complex'];
  for (const tier of tiers) {
    try {
      const response = await callModelSafe({
        tier,
        messages: openAIMessages,
        tools: tools.length > 0 ? toOpenAITools(tools) : undefined,
        tenantId,
        maxTokens: options?.maxTokens ?? 1500,
        temperature: options?.temperature ?? 0.1,
      });
      const choice = response.choices?.[0]?.message;
      const toolCalls = parseGatewayToolCalls(response.choices ?? []);
      const usage = response.usage;
      return {
        content: choice?.content ?? null,
        toolCalls: toolCalls ?? null,
        usage: {
          promptTokens: usage?.prompt_tokens ?? 0,
          completionTokens: usage?.completion_tokens ?? 0,
          totalTokens: (usage?.prompt_tokens ?? 0) + (usage?.completion_tokens ?? 0),
        },
        rawToolCalls: toolCalls?.map((tc) => ({
          id: tc.callId ?? `call_${Date.now()}`,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      };
    } catch {
      continue;
    }
  }

  console.warn(FALLBACK_WARNING);
  const apiKey = getGroqApiKey();
  if (!apiKey) {
    throw new Error('Groq client not available (missing API key)');
  }

  const model = options?.model || GROQ_MODEL;
  const temperature = options?.temperature ?? 0.1;
  const maxTokens = options?.maxTokens ?? 1500;

  const groqMessages = messages.map((m) => {
    if (m.role === 'tool') return { role: 'tool', content: m.content, tool_call_id: m.tool_call_id };
    if (m.role === 'assistant' && m.tool_calls) {
      return { role: 'assistant', content: m.content, tool_calls: m.tool_calls };
    }
    return { role: m.role, content: m.content };
  });

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: groqMessages,
      tools: tools.length > 0 ? toOpenAITools(tools) : undefined,
      tool_choice: tools.length > 0 ? 'auto' : undefined,
      disable_tool_validation: tools.length > 0,
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
 * Streaming completion for final synthesis. Tries gateway streamModel first.
 */
export async function* streamGroqCompletion(
  messages: GroqMessage[],
  options?: { model?: string; temperature?: number; maxTokens?: number; tenantId?: string },
): AsyncGenerator<string> {
  const tenantId = options?.tenantId ?? 'system';
  const openAIMessages = messages.map((m) => ({ role: m.role, content: m.content ?? '' })) as OpenAI.ChatCompletionMessageParam[];

  const tiers: Array<'fast' | 'balanced' | 'complex'> = ['fast', 'balanced', 'complex'];
  for (const tier of tiers) {
    try {
      const { streamModel } = await import('./gateway.js');
      for await (const chunk of streamModel({
        tier,
        messages: openAIMessages,
        tenantId,
        maxTokens: options?.maxTokens ?? 2000,
        temperature: options?.temperature ?? 0.3,
      })) {
        const content = chunk.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
      return;
    } catch {
      continue;
    }
  }

  console.warn(FALLBACK_WARNING);
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
 * Direct Gemini streaming (no LiteLLM). Used when gateway is unreachable.
 */
export async function* streamGeminiCompletion(
  systemPrompt: string,
  userContent: string,
): AsyncGenerator<string> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key not available');
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:streamGenerateContent?key=${apiKey}&alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        generationConfig: { maxOutputTokens: 2048, temperature: 0.4 },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Gemini API error ${res.status}: ${errBody.slice(0, 300)}`);
  }

  if (!res.body) throw new Error('No response body for Gemini streaming');

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
      if (jsonStr === '[DONE]' || jsonStr === '') continue;

      try {
        const parsed = JSON.parse(jsonStr) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) yield text;
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

/**
 * Fallback: Use Anthropic Claude for tool routing when Groq and Gemini fail.
 * Reduces dependency on Gemini (which has strict rate limits).
 */
export async function callClaudeWithTools(
  systemPrompt: string,
  userQuery: string,
  history: ChatMessage[],
  tools: LLMToolDefinition[]
): Promise<LLMRouterResponse> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('Anthropic API key not available');
  }

  const anthropicTools = tools.map((t) => ({
    name: t.function.name,
    description: t.function.description,
    input_schema: t.function.parameters,
  }));

  const messages: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const msg of history.slice(-6)) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userQuery });

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
      system: systemPrompt,
      messages,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
      tool_choice: anthropicTools.length > 0 ? { type: 'auto' } : undefined,
    }),
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Anthropic API error ${res.status}: ${errorText.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{
      type?: string;
      text?: string;
      name?: string;
      input?: Record<string, unknown>;
    }>;
  };

  let toolCalls: ParsedToolCall[] | null = null;
  let textContent: string | null = null;

  for (const block of data.content || []) {
    if (block.type === 'text' && block.text) {
      textContent = block.text;
    }
    if (block.type === 'tool_use' && block.name && block.input != null) {
      if (!toolCalls) toolCalls = [];
      toolCalls.push({
        name: block.name,
        args: block.input,
      });
    }
  }

  return { content: textContent, toolCalls };
}
