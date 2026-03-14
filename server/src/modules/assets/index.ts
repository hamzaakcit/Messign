/**
 * Assets Module — Platform plugin
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { assetTools } from './tools/index.js';
import { registerAssetsEventHandlers } from './events/subscribers.js';
import { getAssetsSystemPromptFragment } from './prompts/assetsContext.js';
import assetsRouter from './routes/index.js';

export const assetsModule: PlatformModule = {
  namespace: 'assets',
  displayName: 'Assets',
  requiredRoles: [],

  registerTools(): ToolRegistration[] {
    return assetTools;
  },

  getRouter(): Router {
    return assetsRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerAssetsEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getAssetsSystemPromptFragment(userRole);
  },
};
