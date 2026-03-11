/**
 * Messign AI Brain — Task-Based Model Router
 *
 * Classifies the task type from the intent/tool selection output
 * and routes to the optimal model for that task type.
 * Replaces cascade-on-failure with direct routing + error-only fallback.
 */

export type TaskType = 'tool_calling' | 'vision' | 'complex_reasoning' | 'synthesis' | 'classification';

export interface ModelSelection {
  model: string;
  provider: 'groq' | 'gemini' | 'anthropic';
}

export function selectModelForTask(taskType: TaskType): ModelSelection {
  switch (taskType) {
    case 'tool_calling':
      return { model: 'llama-3.3-70b-versatile', provider: 'groq' };
    case 'vision':
      return { model: 'claude-sonnet-4-20250514', provider: 'anthropic' };
    case 'complex_reasoning':
      return { model: 'claude-sonnet-4-20250514', provider: 'anthropic' };
    case 'synthesis':
      return { model: 'gemini-2.0-flash-lite', provider: 'gemini' };
    case 'classification':
      return { model: 'llama-3.3-70b-versatile', provider: 'groq' };
    default:
      return { model: 'llama-3.3-70b-versatile', provider: 'groq' };
  }
}

/**
 * Classify the task based on the selected tools and query characteristics.
 */
export function classifyTask(
  toolCount: number,
  toolNames: string[],
  queryLength: number,
): TaskType {
  const hasVisionTool = toolNames.some(
    t => t.includes('scan') || t.includes('extract') || t.includes('ocr') || t.includes('parse_resume'),
  );
  if (hasVisionTool) return 'vision';

  if (toolCount > 3 || queryLength > 500) return 'complex_reasoning';

  if (toolCount === 0) return 'synthesis';

  return 'tool_calling';
}

/**
 * Get the provider ordering for synthesis (the final answer step).
 * Uses task-based selection as primary, with fallback order.
 */
export function getSynthesisProviderOrder(): string[] {
  const primary = selectModelForTask('synthesis');
  const all = ['groq', 'gemini', 'anthropic'];
  return [primary.provider, ...all.filter(p => p !== primary.provider)];
}
