import { trimTextToCharBudget } from '../../../middleware/contextBudget.js';
import { formatHybridCitationsBlock, hybridSearchForAgent } from '../rag/agentHybridSearch.js';

/**
 * Lightweight hybrid retrieval block injected into Dora prompts (not a substitute for search_knowledge_base).
 */
export async function buildHydrationRetrievalBlock(
  userQuery: string,
  organizationId: string | null,
  userRole: string,
  maxChars = 3500,
): Promise<string | undefined> {
  const q = userQuery.trim();
  if (q.length < 3) return undefined;
  const cites = await hybridSearchForAgent({ query: q, organizationId, userRole, topK: 6 });
  if (!cites.length) return undefined;
  const block = formatHybridCitationsBlock(cites);
  return trimTextToCharBudget(block, maxChars);
}
