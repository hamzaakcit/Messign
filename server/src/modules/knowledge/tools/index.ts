/**
 * Knowledge Module — Tool registrations
 * Knowledge tools (search_knowledge_base, get_knowledge_base_stats) are registered globally
 * via services/ai/tools. This module returns empty array.
 */
import type { ToolRegistration } from '../../types.js';

export const knowledgeTools: ToolRegistration[] = [];
