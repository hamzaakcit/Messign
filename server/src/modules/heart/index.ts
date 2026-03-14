/**
 * Heart Module — Platform plugin
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { heartTools } from './tools/index.js';
import { registerHeartEventHandlers } from './events/subscribers.js';
import { getHeartSystemPromptFragment } from './prompts/heartContext.js';
import heartRouter from './routes/index.js';

export const heartModule: PlatformModule = {
  namespace: 'heart',
  displayName: 'Dora Heart',
  requiredRoles: [],

  registerTools(): ToolRegistration[] {
    return heartTools;
  },

  getRouter(): Router {
    return heartRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerHeartEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getHeartSystemPromptFragment(userRole);
  },
};
