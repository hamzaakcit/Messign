/**
 * Knowledge Module — Platform plugin
 * Wraps Knowledge Hub routes. Tools registered globally via services/ai/tools.
 */
import { Router } from 'express';
import type { PlatformModule } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { knowledgeHubRouter } from './routes/index.js';
import { knowledgeTools } from './tools/index.js';
import { registerKnowledgeEventHandlers } from './events/subscribers.js';
import { getKnowledgeSystemPromptFragment } from './prompts/knowledgeContext.js';

export const knowledgeModule: PlatformModule = {
  namespace: 'knowledge-hub',
  displayName: 'Knowledge Hub',
  requiredRoles: [],

  registerTools() {
    return knowledgeTools;
  },

  getRouter(): Router {
    return knowledgeHubRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerKnowledgeEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getKnowledgeSystemPromptFragment(userRole);
  },
};
