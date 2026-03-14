/**
 * Finance Module — Platform plugin
 * Wraps existing finance routes. Tools registered globally via services/ai/tools/finance.
 */
import { Router } from 'express';
import type { PlatformModule } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { financeRouter } from './routes/index.js';
import { financeTools } from './tools/index.js';
import { registerFinanceEventHandlers } from './events/subscribers.js';
import { getFinanceSystemPromptFragment } from './prompts/financeContext.js';

export const financeModule: PlatformModule = {
  namespace: 'finance',
  displayName: 'Finance',
  requiredRoles: ['finance', 'finance_admin', 'manager', 'admin'],

  registerTools() {
    return financeTools;
  },

  getRouter(): Router {
    return financeRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerFinanceEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getFinanceSystemPromptFragment(userRole);
  },
};
