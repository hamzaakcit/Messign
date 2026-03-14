/**
 * Knowledge Module — System prompt fragment for the specialist agent
 */
export function getKnowledgeSystemPromptFragment(userRole: string): string {
  return `You are the Knowledge specialist. Current role: ${userRole}. Capabilities: search, documents, categories.`;
}
