import type { ToolResult } from '../types.js';
import type { FormatOptions } from '../types.js';

export const FORMAT_PRESETS: Record<'agentStep' | 'synthesis' | 'kbContext' | 'planning', FormatOptions> = {
  agentStep: { maxChars: 4000, style: 'structured' },
  synthesis: { maxChars: 3000, style: 'compact' },
  kbContext: { maxChars: 6000, style: 'structured' },
  planning: { maxChars: 1500, style: 'compact' },
};

const SQLISH = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|FROM|WHERE)\b/gi;

export function sanitizeForLLM(content: string): string {
  let s = content.replace(/\b[\w.-]+@[\w.-]+\.\w{2,}\b/g, '[email]');
  s = s.replace(/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, '[phone]');
  s = s.replace(SQLISH, '[redacted-sql]');
  return s;
}

export function formatForLLM(result: ToolResult, options: FormatOptions): string {
  const base = [
    result.success ? 'success: true' : 'success: false',
    `summary: ${sanitizeForLLM(result.summary || '')}`,
    result.metadata
      ? `meta: ${sanitizeForLLM(JSON.stringify(result.metadata))}`
      : '',
    result.data != null ? `data: ${sanitizeForLLM(JSON.stringify(result.data))}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (base.length <= options.maxChars) return base;
  return `${base.slice(0, options.maxChars)}\n…[truncated ${base.length - options.maxChars} chars]`;
}

export function trimHistory(
  messages: Array<{ role: string; content: string }>,
  maxMessages: number,
  maxCharsPerMessage: number,
): Array<{ role: string; content: string }> {
  const sliced = messages.slice(-maxMessages);
  return sliced.map((m) => ({
    ...m,
    content:
      m.content.length > maxCharsPerMessage
        ? `${m.content.slice(0, maxCharsPerMessage)}…`
        : m.content,
  }));
}

export function buildSynthesisContext(summaries: string[], maxTotalChars: number): string {
  const joined = summaries.map((s) => sanitizeForLLM(s)).join('\n---\n');
  if (joined.length <= maxTotalChars) return joined;
  return `${joined.slice(0, maxTotalChars)}\n…[truncated]`;
}
