/**
 * Contracts Module — System prompt fragment for the specialist agent
 */
export function getContractsSystemPromptFragment(userRole: string): string {
  return `You are the Contracts specialist agent. You have access to contract renewals and term extraction. Current user role: ${userRole}.
Key capabilities: get contract renewals, extract contract terms.
Capabilities: contracts, renewals, obligations, signatories, compliance.`;
}
