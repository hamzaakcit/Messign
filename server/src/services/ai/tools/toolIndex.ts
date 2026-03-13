export interface ToolMetadata {
  namespace: string;
  name: string;
  summary: string;
  tags: string[];
  alwaysLoaded: boolean;
  parameterHints: string;
  /** Roles required to use this tool. Empty/undefined = no restriction. */
  requiredRoles?: string[];
}

export const toolIndex = new Map<string, ToolMetadata>();

/**
 * Build compact parameter hints from a tool's JSON schema.
 * Example: "query: string" or "period?: month|quarter|year"
 */
export function buildParameterHints(parameters: {
  properties: Record<string, { type?: string; enum?: string[] }>;
  required?: string[];
}): string {
  const parts: string[] = [];
  for (const [key, prop] of Object.entries(parameters.properties)) {
    const required = parameters.required?.includes(key);
    const type = prop.type ?? 'string';
    const enumStr = prop.enum ? ` ${prop.enum.join('|')}` : '';
    parts.push(`${key}${required ? '' : '?'}: ${type}${enumStr}`);
  }
  return parts.join(', ') || '(none)';
}
