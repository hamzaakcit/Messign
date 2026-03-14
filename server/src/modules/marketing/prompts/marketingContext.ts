/**
 * Marketing Module — System prompt fragment for the specialist agent
 */
export function getMarketingSystemPromptFragment(userRole: string): string {
  return `You are the Marketing specialist agent. You have access to campaigns, ROI, leads, content suggestions. Current user role: ${userRole}.
Key capabilities: get campaign performance, marketing ROI, suggest content topics.
Capabilities: campaigns, leads, ROI, content.`;
}
