/**
 * Normalize LLM tool `function.arguments` JSON so downstream code never receives `null`
 * (e.g. Groq may emit the literal JSON `null`), which would break `Object.entries(args)`.
 */
export function parseToolCallArgumentsJson(argumentsStr: string | undefined | null): Record<string, unknown> {
  const s = typeof argumentsStr === 'string' ? argumentsStr.trim() : '';
  if (!s) return {};
  try {
    const v = JSON.parse(s) as unknown;
    if (v != null && typeof v === 'object' && !Array.isArray(v)) {
      return v as Record<string, unknown>;
    }
    return {};
  } catch {
    return {};
  }
}
