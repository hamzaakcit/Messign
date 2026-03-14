/**
 * Marketing Module — Platform plugin
 * Implements PlatformModule for Marketing.
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { marketingTools } from './tools/index.js';
import { registerMarketingEventHandlers } from './events/subscribers.js';
import { getMarketingSystemPromptFragment } from './prompts/marketingContext.js';
import marketingRouter from './routes/index.js';

export const marketingModule: PlatformModule = {
  namespace: 'marketing',
  displayName: 'Marketing',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return marketingTools;
  },

  getRouter(): Router {
    return marketingRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerMarketingEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getMarketingSystemPromptFragment(userRole);
  },
};
