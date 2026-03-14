/**
 * OKR Module — System prompt fragment for the specialist agent
 */
export function getOkrSystemPromptFragment(userRole: string): string {
  return `You are the OKR specialist agent. You have access to goals, key results, metrics, and goal trees. Current user role: ${userRole}.
Key capabilities: get OKR metrics, list goals, get goal tree.
Capabilities: goals, key results, check-ins, progress tracking.`;
}
