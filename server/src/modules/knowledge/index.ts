/**
 * Knowledge Module — Platform plugin (stub)
 * Wraps knowledge routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { knowledgeHubRouter } from '../../routes/knowledge-hub/index.js';

export const knowledgeModule: PlatformModule = {
  namespace: 'knowledge-hub',
  displayName: 'Knowledge Hub',
  requiredRoles: [],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return knowledgeHubRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers for knowledge.* events when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the Knowledge specialist. Current role: ${userRole}. Capabilities: search, documents, categories.`;
  },
};
