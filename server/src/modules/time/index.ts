/**
 * Time Module — Platform plugin
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { timeTools } from './tools/index.js';
import { registerTimeEventHandlers } from './events/subscribers.js';
import { getTimeSystemPromptFragment } from './prompts/timeContext.js';
import timeRouter from './routes/index.js';

export const timeModule: PlatformModule = {
  namespace: 'time',
  displayName: 'Time Tracking',
  requiredRoles: [],

  registerTools(): ToolRegistration[] {
    return timeTools;
  },

  getRouter(): Router {
    return timeRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerTimeEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getTimeSystemPromptFragment(userRole);
  },
};
