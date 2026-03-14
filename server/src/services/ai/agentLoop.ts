/**
 * Messign AI Brain — Agentic Tool-Calling Loop
 *
 * Single agent that autonomously decides which tools to call,
 * executes them, receives results, and synthesizes answers.
 */

import { getToolsForLLM, executeTool } from './toolRegistry.js';
import { callGroqWithToolsMultiTurn, type GroqMessage } from './groqToolCalling.js';
import { buildAgentSystemPrompt } from './agentPrompts.js';
import { buildDoraSystemPrompt } from './dora/prompts.js';
import { sanitizeData } from './dataSanitizer.js';
import { logToolExecution } from './queryLogger.js';
import type { ToolContext, ToolResult, ChatMessage } from './types.js';
import type { DoraRequestContext } from './dora/types.js';

const MAX_TOOL_ITERATIONS = 5;

const STRICT_RAG_PREAMBLE = `STRICT RAG DIRECTIVES (you must follow these for the knowledge base context below):
1. Answer the user's question ONLY using the CONTEXT below. Do NOT use general knowledge.
2. Read the CONTEXT deeply. Look for synonyms or related explanations if the exact phrase isn't obvious.
3. If the context contains the answer, explain it comprehensively. Quote important terms.
4. If the exact answer is not in the context: (1) Infer from related concepts, synonyms, or adjacent content when reasonable. (2) If inference is not safe, suggest escalation: "This isn't covered in our docs — consider asking the relevant team or creating a doc request." (3) Never say "I cannot find" without offering inference or escalation.
5. COMMENT step: After answering, add 1–2 related concepts or document titles from the context if they would help the user (e.g. "You might also find the [Document Title] relevant.").

CONTEXT:
`;

export interface AgentLoopResult {
  toolsUsed: string[];
  toolResults: ToolResult[];
  synthesisProvider: 'groq' | 'fallback';
}

/**
 * Run the agentic tool-calling loop.
 * Uses Groq to decide tools, executes them, and streams the final synthesized answer.
 */
export async function runAgentLoop(
  userQuery: string,
  history: ChatMessage[],
  context: ToolContext,
  onChunk: (text: string) => void,
  doraCtx?: DoraRequestContext,
): Promise<AgentLoopResult> {
  const tools = getToolsForLLM();
  const systemPrompt = doraCtx
    ? buildDoraSystemPrompt(doraCtx)
    : buildAgentSystemPrompt(context);

  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
  ];

  const recentHistory = history.slice(-6);
  for (const msg of recentHistory) {
    if (msg.role === 'user' || msg.role === 'assistant') {
      messages.push({ role: msg.role, content: msg.content });
    }
  }
  messages.push({ role: 'user', content: userQuery });

  const toolsUsed: string[] = [];
  const toolResults: ToolResult[] = [];
  let iterations = 0;

  const tenantId = context.organizationId ?? 'system';

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;
    const response = await callGroqWithToolsMultiTurn(messages, tools, tenantId);

    if (response.toolCalls && response.toolCalls.length > 0) {
      const toolCallsWithIds = response.toolCalls.map((tc, idx) => ({
        ...tc,
        resolvedId: tc.callId || `call_${iterations}_${idx}_${tc.name}`,
      }));

      messages.push({
        role: 'assistant',
        content: null,
        tool_calls: toolCallsWithIds.map((tc) => ({
          id: tc.resolvedId,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      for (const tc of toolCallsWithIds) {
        const start = Date.now();
        const result = await executeTool(tc.name, tc.args as Record<string, unknown>, context);
        const elapsed = Date.now() - start;
        logToolExecution(null, tc.name, elapsed, result.success, result.metadata?.count ?? 0).catch((err) => console.error('[agentLoop] logToolExecution failed', { error: err instanceof Error ? err.message : String(err) }));

        toolsUsed.push(tc.name);
        const sanitized: ToolResult = {
          ...result,
          data: result.data ? sanitizeData(result.data, context.userRole === 'admin') : null,
        };
        toolResults.push(sanitized);

        let toolContent = result.summary || JSON.stringify(result.data ?? {});
        if ((tc.name === 'knowledge:search_knowledge_base' || tc.name?.endsWith('search_knowledge_base')) && result.success && result.summary?.includes('| Content:')) {
          const confidence = result.metadata?.confidence ?? 0.7;
          const lowConfidenceNote =
            confidence < 0.5
              ? 'Note: Retrieval confidence is low. Consider inferring from related content or suggesting the user request documentation.\n\n'
              : confidence < 0.7
                ? 'Note: Retrieval confidence is moderate. Light inference from related concepts is acceptable.\n\n'
                : '';
          toolContent = STRICT_RAG_PREAMBLE + lowConfidenceNote + result.summary;
        }
        messages.push({
          role: 'tool',
          tool_call_id: tc.resolvedId,
          content: toolContent.slice(0, 8000),
        });
      }
      continue;
    }

    if (response.content && response.content.trim()) {
      onChunk(response.content.trim());
      return {
        toolsUsed,
        toolResults,
        synthesisProvider: 'groq',
      };
    }
  }

  const fallbackContext = formatFallbackContext(toolResults, toolsUsed);
  if (fallbackContext) {
    onChunk(`Based on the data retrieved:\n\n${fallbackContext.slice(0, 2000)}${fallbackContext.length > 2000 ? '\n\n[... truncated]' : ''}`);
  } else {
    onChunk("I wasn't able to find specific data for your question. Try rephrasing or ask about a specific topic, project, or person.");
  }

  return {
    toolsUsed,
    toolResults,
    synthesisProvider: 'fallback',
  };
}

function formatFallbackContext(results: ToolResult[], toolNames: string[]): string {
  const sections: string[] = [];
  for (let i = 0; i < results.length; i++) {
    const r = results[i]!;
    const name = toolNames[i] || 'unknown';
    if (r.success && r.summary) {
      sections.push(`[${name}]\n${r.summary}`);
    }
  }
  return sections.join('\n\n---\n\n');
}
