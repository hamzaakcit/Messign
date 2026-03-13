/**
 * Marketing Module — Platform plugin (stub)
 * Wraps existing marketing routes. Tools and prompts to be migrated.
 */
import { Router } from 'express';
import type { PlatformModule, ToolRegistration } from '../types.js';
import type { EventBus } from '../../platform/eventBus.js';
import { marketingRouter } from '../../routes/marketing/index.js';

export const marketingModule: PlatformModule = {
  namespace: 'marketing',
  displayName: 'Marketing',
  requiredRoles: ['manager', 'admin'],

  registerTools(): ToolRegistration[] {
    return [];
  },

  getRouter(): Router {
    return marketingRouter;
  },

  registerEventHandlers(_eventBus: EventBus): void {
    // Event handlers migrated from marketingSubscriber when ready
  },

  getSystemPromptFragment(userRole: string): string {
    return `You are the Marketing specialist. Current role: ${userRole}. Capabilities: campaigns, leads, content, ROI.`;
  },
};
