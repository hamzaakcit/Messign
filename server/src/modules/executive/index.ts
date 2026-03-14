/**
 * Executive Module — Platform plugin (no specialist agent)
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { executiveTools } from './tools/index.js';
import { registerExecutiveEventHandlers } from './events/subscribers.js';
import { getExecutiveSystemPromptFragment } from './prompts/executiveContext.js';
import executiveRouter from './routes/index.js';

export const executiveModule: PlatformModule = {
  namespace: 'executive',
  displayName: 'Executive Dashboard',
  requiredRoles: ['admin', 'manager', 'executive'],

  registerTools(): ToolRegistration[] {
    return executiveTools;
  },

  getRouter(): Router {
    return executiveRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerExecutiveEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getExecutiveSystemPromptFragment(userRole);
  },
};
