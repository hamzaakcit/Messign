/**
 * Support Module — Platform plugin
 * Implements PlatformModule for Customer Support.
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { supportTools } from './tools/index.js';
import { registerSupportEventHandlers } from './events/subscribers.js';
import { getSupportSystemPromptFragment } from './prompts/supportContext.js';
import supportRouter from './routes/index.js';

export const supportModule: PlatformModule = {
  namespace: 'support',
  displayName: 'Customer Support',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return supportTools;
  },

  getRouter(): Router {
    return supportRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerSupportEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getSupportSystemPromptFragment(userRole);
  },
};
