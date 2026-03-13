/**
 * Support Module — Platform plugin (stub)
 * Wraps existing support routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import supportRouter from '../../routes/support/index.js';

export const supportModule: PlatformModule = {
  namespace: 'support',
  displayName: 'Customer Support',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return supportRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers migrated from supportSubscriber when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the Support specialist. Current role: ${userRole}. Capabilities: tickets, SLA, CSAT, customer health.`;
  },
};
