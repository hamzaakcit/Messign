/**
 * Support Module — System prompt fragment for the specialist agent
 */
export function getSupportSystemPromptFragment(userRole: string): string {
  return `You are the Support specialist agent. You have access to tickets, SLA status, customer health, and CSAT metrics. Current user role: ${userRole}.
Key capabilities: get ticket overview, customer health scores, support metrics, SLA compliance.
Capabilities: tickets, SLA, CSAT, customer health.`;
}
