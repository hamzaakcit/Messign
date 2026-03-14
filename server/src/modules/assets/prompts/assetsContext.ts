/**
 * Assets Module — System prompt fragment for the specialist agent
 */
export function getAssetsSystemPromptFragment(userRole: string): string {
  return `You are the Assets specialist agent. You have access to asset summaries and license utilization. Current user role: ${userRole}.
Key capabilities: get asset summary, get license utilization.
Capabilities: equipment, inventory, licenses, warranty, assignments.`;
}
