/**
 * Marketing Automation — Platform module (workflows, triggers, schedules).
 */
import type { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { marketingAutomationTools } from './tools/index.js';
import { registerMarketingAutomationEventHandlers } from './events/subscribers.js';
import { getMarketingAutomationSystemPromptFragment } from './prompts/marketingAutomationContext.js';
import marketingAutomationRouter from './routes/index.js';

export const marketingAutomationModule: PlatformModule = {
  namespace: 'marketing_automation',
  displayName: 'Marketing Automation',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return marketingAutomationTools;
  },

  getRouter(): Router {
    return marketingAutomationRouter;
  },

  registerEventHandlers(eventBus: EventBus): void {
    registerMarketingAutomationEventHandlers(eventBus);
  },

  getSystemPromptFragment(userRole: string): string {
    return getMarketingAutomationSystemPromptFragment(userRole);
  },
};
