/**
 * Contracts Module — Platform plugin
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { contractTools } from './tools/index.js';
import { registerContractsEventHandlers } from './events/subscribers.js';
import { getContractsSystemPromptFragment } from './prompts/contractsContext.js';
import contractsRouter from './routes/index.js';

export const contractsModule: PlatformModule = {
  namespace: 'contracts',
  displayName: 'Contracts',
  requiredRoles: [],

  registerTools(): ToolRegistration[] {
    return contractTools;
  },

  getRouter(): Router {
    return contractsRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerContractsEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getContractsSystemPromptFragment(userRole);
  },
};
