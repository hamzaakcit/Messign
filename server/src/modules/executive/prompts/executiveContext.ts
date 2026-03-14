/**
 * Executive Module — System prompt fragment (no specialist agent)
 */
export function getExecutiveSystemPromptFragment(userRole: string): string {
  return `You are the Executive specialist. Current role: ${userRole}. Capabilities: KPIs, dashboard, reports, briefings, cross-module queries.`;
}
