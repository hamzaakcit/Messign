/**
 * OKR Module — Platform plugin
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { okrTools } from './tools/index.js';
import { registerOkrEventHandlers } from './events/subscribers.js';
import { getOkrSystemPromptFragment } from './prompts/okrContext.js';
import okrRouter from './routes/index.js';

export const okrModule: PlatformModule = {
  namespace: 'okr',
  displayName: 'OKRs',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return okrTools;
  },

  getRouter(): Router {
    return okrRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerOkrEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getOkrSystemPromptFragment(userRole);
  },
};
